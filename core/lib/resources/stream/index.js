var Resource = require('../../resource.js'),
    Persistence = require('persistence'),
    logging = require('minilog')('radar:stream'),
    SubscriberState = require('./subscriber_state.js');

var default_options = {
  policy: {
    maxPersistence: 7 * 24 * 60 * 60,         // 1 week in seconds
    maxLength: 100000
  }
};

function Stream(name, parent, options) {
  Resource.call(this, name, parent, options, default_options);
  this.list = new Persistence.List(name, this.options.policy.maxPersistence, this.options.policy.maxLength);
  this.subscriberState = new SubscriberState();
}

Stream.prototype = new Resource();
Stream.prototype.type = 'stream';

Stream.prototype._getSyncError = function(from) {
  return {
    to: this.name,
    error: {
      type: 'sync-error',
      from: from,
      start: this.start,
      end: this.end,
      size: this.size
    }
  };
};

Stream.prototype._subscribe = function(client, message) {
  var self = this,
      from = message.options && message.options.from,
      sub = this.subscriberState.get(client.id);

  if (typeof from === 'undefined' || from < 0) {
    return;
  }

  sub.startSubscribing(from);
  this._get(from, function(error, values) {
    if (error) {
      var syncError = self._getSyncError(from);
      syncError.op = 'push';
      client.send(syncError);
    } else {
      values.forEach(function(message) {
        message.op = 'push';
        message.to = self.name;
        client.send(message);
        sub.sent = message.id;
      });
    }
    sub.finishSubscribing();
  });
};

Stream.prototype.subscribe = function(client, message) {
  Resource.prototype.subscribe.call(this, client, message);
  this._subscribe(client, message);
};

Stream.prototype.get = function(client, message) {
  var stream = this,
      from = message && message.options && message.options.from;
  logging.debug('#stream - get', this.name,'from: '+from, (client && client.id));

  this._get(from, function(error, values) {
    if (error) {
      var syncError = stream._getSyncError(from);
      syncError.op = 'get';
      syncError.value = [];
      client.send(syncError);
    } else {
      client.send({
        op: 'get',
        to: stream.name,
        value: values || []
      });
    }
  });
};

Stream.prototype._get = function(from, callback) {
  var self = this;
  this.list.info(function(error, start, end, size) {
    self.start = start;
    self.end = end;
    self.size = size;
    self.list.read(from, start, end, size, callback);
  });
};

Stream.prototype.push = function(client, message) {
  var self = this;
  var policy = this.options.policy || {};

  logging.debug('#stream - push', this.name, message, (client && client.id));

  var m = {
    to: this.name,
    op: 'push',
    resource: message.resource,
    action: message.action,
    value: message.value,
    userData: message.userData
  };


  this.list.push(m, function(error, stamped) {
    if (error) {
      console.log(error);
      logging.error(error);
      return;
    }

    logging.debug('#stream - push complete with id', self.name, stamped, (client && client.id));
    self.ack(client, message.ack);
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
  Object.keys(this.subscribers).forEach(function(clientId) {
    var client = self.clientGet(clientId);
    if (client && client.send) {
      var sub = self.subscriberState.get(client.id);
      if (sub && sub.sendable(data)) {
        client.send(data);
        sub.sent = data.id;
      }
    }
  });

  // Someone released the lock, wake up
  this.list.unblock();
};

Stream.setBackend = function(backend) { Persistence = backend; };

module.exports = Stream;
