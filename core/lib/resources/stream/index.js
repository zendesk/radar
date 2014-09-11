var Resource = require('../../resource.js'),
    Persistence = require('persistence'),
    logger = require('minilog')('radar:stream'),
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
}

Stream.prototype = new Resource();
Stream.prototype.type = 'stream';

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

Stream.prototype.subscribe = function(client, message) {
  var self = this;
  var from = message.options && message.options.from;
  Resource.prototype.subscribe.call(this, client, message);
  if(typeof from === 'undefined') {
    return;
  }
  this._get(from, function(error, values) {
    if(error) {
      client.send({
        op: 'push',
        to: self.name,
        error: {
          type: 'sync-error',
          from: from,
          start: self.start,
          end: self.end,
          length: self.length
        }
      });
    } else {
      var i, message;
      for(i = 0; i < values.length; i++) {
        message = values[i];
        message.op = 'push';
        message.to = self.name;
        client.send(message);
      }
    }
  });
};

// get status
Stream.prototype.get = function(client, message) {
  var stream = this,
      name = this.name,
      redis = Persistence.redis(),
      from = message.options && message.options.from;
  logger.debug('#stream - get', this.name,'from: '+from, (client && client.id));

  this._get(from, function(error, values) {
    if(error) {
      client.send({
        op: 'get',
        to: name,
        value: [],
        error: {
          type: 'sync-error',
          from: from,
          start: stream.start,
          end: stream.end,
          length: stream.length
        }
      });
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

      logger.debug('#stream -lrange', name, parsed);
      callback(null, parsed);
    });
  });
};

Stream.prototype.push = function(client, message) {
  var self = this, redis = Persistence.redis();
  var policy = this.options.policy || {};

  logger.debug('#stream - push', this.name, message, (client && client.id));

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
        } else {
          logger.warn('resource created without ttl :', self.name);
          logger.warn('resource policy was :', policy);
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
  logger.debug('#stream - sync', this.name, (client && client.id));
  this.get(client, message);
  this.subscribe(client, false);
};

Stream.prototype.redisIn = function(data) {
  Resource.prototype.redisIn.call(this, data);
  //someone released the lock, wake up
  this.counter.wakeUp();
};

Stream.setBackend = function(backend) { Persistence = backend; };

module.exports = Stream;
