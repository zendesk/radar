var Resource = require('../resource.js'),
    Persistence = require('persistence'),
    logging = require('minilog')('radar:stream'),
    SubscriberState = require('./subscriber_state.js');

var default_options = {
  policy: {
    maxPersistence: 7 * 24 * 60 * 60,         // 1 week in seconds
    maxLength: 100000
  }
};

function Stream(to, server, options) {
  Resource.call(this, to, server, options, default_options);
  this.list = new Persistence.List(to, this.options.policy.maxPersistence, this.options.policy.maxLength);
  this.subscriberState = new SubscriberState();
}

Stream.prototype = new Resource();
Stream.prototype.type = 'stream';

Stream.prototype._getSyncError = function(from) {
  return {
    to: this.to,
    error: {
      type: 'sync-error',
      from: from,
      start: this.start,
      end: this.end,
      size: this.size
    }
  };
};

Stream.prototype._subscribe = function(socket, message) {
  var self = this,
      from = message.options && message.options.from,
      sub = this.subscriberState.get(socket.id);

  if (typeof from === 'undefined' || from < 0) {
    return;
  }

  sub.startSubscribing(from);
  this._get(from, function(error, values) {
    if (error) {
      var syncError = self._getSyncError(from);
      syncError.op = 'push';
      socket.send(syncError);
    } else {
      values.forEach(function(message) {
        message.op = 'push';
        message.to = self.to;
        socket.send(message);
        sub.sent = message.id;
      });
    }
    sub.finishSubscribing();
  });
};

Stream.prototype.subscribe = function(socket, message) {
  Resource.prototype.subscribe.call(this, socket, message);
  this._subscribe(socket, message);
};

Stream.prototype.get = function(socket, message) {
  var stream = this,
      from = message && message.options && message.options.from;
  logging.debug('#stream - get', this.to,'from: '+from, (socket && socket.id));

  this._get(from, function(error, values) {
    if (error) {
      var syncError = stream._getSyncError(from);
      syncError.op = 'get';
      syncError.value = [];
      socket.send(syncError);
    } else {
      socket.send({
        op: 'get',
        to: stream.to,
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

Stream.prototype.push = function(socket, message) {
  var self = this;
  var policy = this.options.policy || {};

  logging.debug('#stream - push', this.to, message, (socket && socket.id));

  var m = {
    to: this.to,
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

    logging.debug('#stream - push complete with id', self.to, stamped, (socket && socket.id));
    self.ack(socket, message.ack);
  });
};

Stream.prototype.sync = function(socket, message) {
  logging.debug('#stream - sync', this.to, (socket && socket.id));
  this.get(socket, message);
  this.subscribe(socket, false);
};

Stream.prototype.redisIn = function(data) {
  var self = this;
  logging.info('#'+this.type, '- incoming from #redis', this.to, data, 'subs:', Object.keys(this.subscribers).length );
  Object.keys(this.subscribers).forEach(function(socketId) {
    var socket = self.socketGet(socketId);
    if (socket && socket.send) {
      var sub = self.subscriberState.get(socket.id);
      if (sub && sub.sendable(data)) {
        socket.send(data);
        sub.sent = data.id;
      }
    }
  });

  // Someone released the lock, wake up
  this.list.unblock();
};

Stream.setBackend = function(backend) { Persistence = backend; };

module.exports = Stream;
