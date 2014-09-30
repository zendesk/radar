var Resource = require('../../resource.js'),
    Persistence = require('persistence'),
    logging = require('minilog')('radar:stream'),
    StreamCounter = require('./stream_counter.js');

var default_options = {
  policy: {
    maxPersistence: 7 * 24 * 60 * 60, // 1 week in seconds
    maxLength: 100000
  }
};

function Stream(name, parent, options) {
  Resource.call(this, name, parent, options, default_options);
  this.counter = new StreamCounter(name);
  this.streamSubs = {};
}

Stream.prototype = new Resource();
Stream.prototype.type = 'stream';

function StreamSubscriber(clientId) {
  this.id = clientId;
  this.sent = null;
  this.sendDisabled = false;
}

StreamSubscriber.prototype.startSubscribing = function(from) {
  this.sent = from;
  this.sentDisabled = true;
};

StreamSubscriber.prototype.finishSubscribing = function() {
  this.sentDisabled = false;
};

Stream.prototype.update = function(callback) {
  var self = this;
  var multi = Persistence.redis().multi();

  multi.lrange(this.name, 0, 0, function(error, values) {
    if(error) throw new Error(error);

    if(values.length == 1) {
      self.start = JSON.parse(values[0]).id;
    } else {
      delete self.start;
    }
  });

  multi.lrange(this.name, -1, -1, function(error, values) {
    if(error) throw new Error(error);

    if(values.length == 1) {
      self.end = JSON.parse(values[0]).id;
    } else {
      delete self.end;
    }
  });

  multi.llen(this.name, function(error, value) {
    if(error) throw new Error(error);

    self.length = value;
  });

  multi.exec(function() {
    if(callback) callback();
  });
};

Stream.prototype.getSyncError = function(from) {
  return {
    to: this.name,
    error: {
      type: 'sync-error',
      from: from,
      start: this.start,
      end: this.end,
      length: this.length
    }
  };
};
Stream.prototype.subscribe = function(client, message) {
  var self = this;
  var from = message.options && message.options.from;
  Resource.prototype.subscribe.call(this, client, message);
  var subscriber = new StreamSubscriber(client.id);
  this.streamSubs[client.id] = subscriber;
  if(typeof from === 'undefined') {
    return;
  }
  subscriber.startSubscribing(from);
  this._get(from, function(error, values) {
    if(error) {
      var syncError = self.getSyncError(from);
      syncError.op = 'push';
      client.send(syncError);
    } else {
      var i, message;
      for(i = 0; i < values.length; i++) {
        message = values[i];
        message.op = 'push';
        message.to = self.name;
        client.send(message);
        subscriber.sent = message.id;
      }
    }
    subscriber.finishSubscribing();
  });
};

// get status
Stream.prototype.get = function(client, message) {
  var stream = this,
      name = this.name,
      redis = Persistence.redis(),
      from = message.options && message.options.from;
  logging.debug('#stream - get', this.name,'from: '+from, (client && client.id));

  this._get(from, function(error, values) {
    if(error) {
      var syncError = stream.getSyncError(from);
      syncError.op = 'get';
      syncError.value = [];
      client.send(syncError);
    } else {
      client.send({
        op: 'get',
        to: name,
        value: values || []
      });
    }
  });
};

Stream.prototype._getReadOffsets = function(from) {
  var endOffset = -1; //always read to the end
  var startOffset = 0; //default is from the start
  if(from > 0) {
    if(this.length === 0 || from < this.start || from > this.end) {
      return null;
    }
    var distance = this.end - this.start + 1;
    var skipped = distance - this.length; //if ids were ever skipped
    startOffset = endOffset - from - this.end - skipped;
    startOffset = startOffset - 100; //buffer for any newly added members
  }
  return [ startOffset, endOffset ];
};

Stream.prototype._get = function(from, callback) {
  var stream = this,
      name = this.name,
      redis = Persistence.redis();

  this.update(function() {
    var offsets = stream._getReadOffsets(from);
    if(!offsets) {
      //sync error
      callback('sync-error');
      return;
    }

    redis.lrange(name, offsets[0], offsets[1], function(error, replies) {
      var parsed = [];
      if(error) throw error;

      replies = replies || [];
      replies.forEach(function(reply) {
        var message = JSON.parse(reply);
        if(from >= 0 && message.id <= from) {
          return; //filter out
        }
        parsed.push(message);
      });

      logging.debug('#stream -lrange', name, parsed);
      callback(null, parsed);
    });
  });
};

Stream.prototype.push = function(client, message) {
  var self = this, redis = Persistence.redis();
  var policy = this.options.policy || {};

  logging.debug('#stream - push', this.name, message, (client && client.id));

  this.counter.increment(function(value) {
    message.id = value;
    if(policy.maxLength === 0) {//only publish
      Persistence.publish(self.name, message, function() {
        self.ack(client, message.ack);
      });
    } else {
      self._push(message, function(error, length) {
        if(error) {
          logging.error(error);
          return;
        }

        if(policy.maxPersistence) {
          Persistence.expire(self.name, policy.maxPersistence);
          self.counter.expire(policy.maxPersistence);
        } else {
          logging.warn('resource created without ttl :', self.name);
          logging.warn('resource policy was :', policy);
        }

        if(policy.maxLength && length > policy.maxLength) {
          redis.ltrim(self.name, -policy.maxLength, -1);
        }

        Persistence.publish(self.name, message, function() {
          self.ack(client, message.ack);
        });
      });
    }
  });
};

Stream.prototype._push = function(message, callback) {
  Persistence.redis().rpush(this.name, JSON.stringify({
    id: message.id,
    resource: message.resource,
    action: message.action,
    value: message.value,
    userData: message.userData
  }), function(error, length) {
    if(error) {
      callback(error);
      return;
    }
    if(callback) callback(null, length);
  });
};

Stream.prototype.sync = function(client, message) {
  logging.debug('#stream - sync', this.name, (client && client.id));
  this.get(client, message);
  this.subscribe(client, false);
};

Stream.prototype.redisIn = function(data) {
  var self = this;
  logging.info('#'+this.type, '- incoming from #redis', this.name, data, 'subs:', Object.keys(this.subscribers).length );
  Object.keys(this.subscribers).forEach(function(subscriber) {
    var client = self.parent.server.clients[subscriber];
    if (client && client.send) {
      var streamSub = self.streamSubs[client.id];
      if(streamSub && data.id > streamSub.sent && !streamSub.sendDisabled) {
        client.send(data);
        streamSub.sent = data.id;
      }
    }
  });
  //someone released the lock, wake up
  this.counter.wakeUp();
};

Stream.setBackend = function(backend) { Persistence = backend; };

module.exports = Stream;
