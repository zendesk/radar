var Resource = require('../../resource.js'),
    shasum = require('crypto').createHash('sha1'),
    PresenceManager = require('./presence_manager.js'),
    Sentry = require('./sentry.js'),
    EventEmitter = require('events').EventEmitter,
    logging = require('minilog')('radar:presence');

var default_options = {
  policy: {
    // 12 hours in seconds
    maxPersistence: 12 * 60 * 60,

    // Buffer time for a user to timeout after client disconnects (implicit)
    userExpirySeconds: 15
  }
};

shasum.update(require('os').hostname() + ' ' + Math.random() + ' ' + Date.now());
var sentryName = shasum.digest('hex').slice(0,15);
Presence.sentry = new Sentry(sentryName);

function Presence(name, server, options) {
  Resource.call(this, name, server, options, default_options);
  this.setup();
}

Presence.resource_count = 0;

Presence.prototype = new Resource();
Presence.prototype.type = 'presence';

Presence.prototype.setup = function() {
  var self = this;

  this.manager = new PresenceManager(this.name, this.options.policy, Presence.sentry);
  this.manager.on('user_online', function(userId, userType, userData) {
    logging.info('#presence - user_online', userId, userType, self.name);
    var value = {};
    value[userId] = userType;
    self.broadcast({
      to: self.name,
      op: 'online',
      value: value,
      userData: userData,
    });
  });

  this.manager.on('user_offline', function(userId, userType) {
    logging.info('#presence - user_offline', userId, userType, self.name);
    var value = {};
    value[userId] = userType;
    self.broadcast({
      to: self.name,
      op: 'offline',
      value: value
    });
  });

  this.manager.on('client_online', function(socketId, userId, userType, userData) {
    logging.info('#presence - client_online', socketId, userId, self.name);
    self.broadcast({
      to: self.name,
      op: 'client_online',
      value: {
        userId: userId,
        clientId: socketId,
        userData: userData,
      }
    });
  });

  this.manager.on('client_offline', function(socketId, userId, explicit) {
    logging.info('#presence - client_offline', socketId, userId, explicit, self.name);
    self.broadcast({
      to: self.name,
      op: 'client_offline',
      explicit: !!explicit,
      value: {
        userId: userId,
        clientId: socketId
      }
    }, socketId);
  });

  // Keep track of listener count
  Presence.resource_count++;
  var sentryListenersCount = EventEmitter.listenerCount(Presence.sentry, 'down');
  if (sentryListenersCount != Presence.resource_count) {
    logging.warn('sentry listener leak detected', sentryListenersCount -
                                                  Presence.resource_count);
  }
};

Presence.prototype.redisIn = function(message) {
  logging.info('#presence - incoming from #redis', this.name, message, 'subs:',
                                          Object.keys(this.subscribers).length );
  this.manager.processRedisEntry(message);
};

Presence.prototype.set = function(socket, message) {
  var presence = this,
      userId = message.key;

  function ackCheck() {
    presence.ack(socket, message.ack);
  }

  if (message.value != 'offline') {
    this._set_online(socket);
    this.manager.addClient(socket.id, userId, message.type, message.userData, ackCheck);
  } else {
    // If this is client is not subscribed
    if (!this.subscribers[socket.id]) {
      // This is possible if a client does .set('offline') without
      // set-online/sync/subscribe
      Resource.prototype.unsubscribe.call(this, socket, message);
    } else {
      // Remove from local
      this.manager.removeClient(socket.id, userId, message.type, ackCheck);
    }
  }
};

Presence.prototype._set_online = function(socket) {
  if (!this.subscribers[socket.id]) {
    // We use subscribe/unsubscribe to trap the "close" event, so subscribe now
    this.subscribe(socket);

    // We are subscribed, but not listening
    this.subscribers[socket.id] = { listening: false };
  }
};

Presence.prototype.subscribe = function(socket, message) {
  Resource.prototype.subscribe.call( this, socket, message);
  this.subscribers[socket.id] = { listening: true };
};

Presence.prototype.unsubscribe = function(socket, message) {
  logging.info('#presence - implicit disconnect', socket.id, this.name);
  this.manager.disconnectClient(socket.id);

  Resource.prototype.unsubscribe.call(this, socket, message);
};

Presence.prototype.sync = function(socket, message) {
  var self = this;
  this.fullRead(function(online) {
    if (message.options && message.options.version == 2) {
      socket.send({
        op: 'get',
        to: self.name,
        value: self.manager.getClientsOnline()
      });
    } else {
      logging.warn('presence v1 received, sending online', self.name, socket.id);

      // Will deprecate when syncs no longer need to use "online" to look like
      // regular messages
      socket.send({
        op: 'online',
        to: self.name,
        value: online
      });
    }
  });
  this.subscribe(socket, message);
};

// This is a full sync of the online status from Redis
Presence.prototype.get = function(socket, message) {
  var self = this;
  this.fullRead(function(online) {
    if (message.options && message.options.version == 2) {
      socket.send({
        op: 'get',
        to: self.name,
        value: self.manager.getClientsOnline()
      });
    } else {
      socket.send({
        op: 'get',
        to: self.name,
        value: online
      });
    }
  });
};

Presence.prototype.broadcast = function(message, except) {
  logging.debug('#presence - update subscribed clients', message, except, this.name);
  var self = this;
  Object.keys(this.subscribers).forEach(function(socketId) {
    var socket = self.socketGet(socketId);
    if (socket && socket.id != except && self.subscribers[socket.id].listening) {
      socket.send(message);
    } else {
      logging.warn('#socket - not sending: ', (socket && socket.id), message,  except,
        'explicit:', (socket && socket.id && self.subscribers[socket.id]), self.name);
    }
  });
};

Presence.prototype.fullRead = function(callback) {
  this.manager.fullRead(callback);
};

Presence.prototype.destroy = function() {
  this.manager.destroy();
  Presence.resource_count --;
};

Presence.setBackend = function(backend) {
  PresenceManager.setBackend(backend);
};

Presence.Sentry = Sentry;

module.exports = Presence;
