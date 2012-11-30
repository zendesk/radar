var Resource = require('../../resource.js'),
    Persistence = require('../../persistence.js'),
    LocalManager = require('./local_manager.js'),
    logging = require('minilog')('presence');

function Presence(name, parent, options) {
  Resource.call(this, name, parent, options);
  var self = this;
  this.type = 'presence';

  this._xserver = new LocalManager(this.name);
  this._xserver.on('user_online', function(userId, userType) {
    logging.debug('user_online', userId, userType);
    var value = {};
    value[userId] = userType;
    self.broadcast(JSON.stringify({
      to: self.name,
      op: 'online',
      value: value
    }));
  });
  this._xserver.on('user_offline', function(userId, userType) {
    logging.debug('user_offline', userId, userType);
    var value = {};
    value[userId] = userType;
    self.broadcast(JSON.stringify({
      to: self.name,
      op: 'offline',
      value: value
    }));
  });
  this._xserver.on('client_online', function(clientId, userId) {
    logging.debug('client_online', clientId, userId);
    self.broadcast(JSON.stringify({
      to: self.name,
      op: 'client_online',
      value: {
        userId: userId,
        clientId: clientId
      }
    }));
  });
  this._xserver.on('client_offline', function(clientId, userId) {
    logging.debug('client_offline', clientId, userId);
    self.broadcast(JSON.stringify({
      to: self.name,
      op: 'client_offline',
      value: {
        userId: userId,
        clientId: clientId
      }
    }), clientId);
  });

  // add parent callback
  this.parentCallback = function() {
    self._xserver.timeouts();
  };
  this.parent.timer.add( this.parentCallback );
}

Presence.prototype = new Resource();

Presence.prototype.redisIn = function(data) {
  try {
    var message = JSON.parse(data);
  } catch(e) { return; }

  this._xserver.remoteMessage(message);
};

Presence.prototype.setStatus = function(client, message, sendAck) {
  if(arguments.length == 1) {
    message = client; // client and sendAck are optional
  }
  var self = this,
      userId = message.key,
      userType = message.type,
      isOnline = (message.value != 'offline');

  function ackCheck() {
    sendAck && self.ack(client, sendAck);
  }

  if(isOnline) {
    // we use subscribe/unsubscribe to trap the "close" event, so subscribe now
    this.subscribe(client);
    this._xserver.addLocal(client.id, userId, userType, ackCheck);
  } else {
    // remove from local
    this._xserver.removeLocal(client.id, userId, ackCheck);
  }
};

Presence.prototype.unsubscribe = function(client, sendAck) {
  var self = this;
  this._xserver.disconnectLocal(client.id);
  // garbage collect if the set of subscribers is empty
  if (Object.keys(this.subscribers).length == 1) {
    this.parent.timer.remove(this.parentCallback);
  }
  // call parent
  Resource.prototype.unsubscribe.call(this, client, sendAck);
};

Presence.prototype.sync = function(client, message) {
  var self = this;
  this.fullRead(function(online) {
    if(message.options && message.options.version == 2) {
      client.send(JSON.stringify({
        op: 'get',
        to: self.name,
        value: self._xserver.getClientsOnline()
      }));
    } else {
      // will be deprecated when syncs no longer need to use "online" to look like
      // regular messages
      client.send(JSON.stringify({
        op: 'online',
        to: self.name,
        value: online
      }));
    }
  });
};

// this is a full sync of the online status from Redis
Presence.prototype.getStatus = function(client, message) {
  var self = this;
  this.fullRead(function(online) {
    if(message.options && message.options.version == 2) {
      client.send(JSON.stringify({
        op: 'get',
        to: self.name,
        value: self._xserver.getClientsOnline()
      }));
    } else {
      client.send(JSON.stringify({
        op: 'get',
        to: self.name,
        value: online
      }));
    }
  });
};

Presence.prototype.broadcast = function(message, except) {
  logging.debug('updateSubscribers', message, except);
  var self = this;
  Object.keys(this.subscribers).forEach(function(subscriber) {
    var client = self.parent.server.clients[subscriber];
    if(client && client.id != except) {
      client.send(message);
    }
  });
};

Presence.prototype.fullRead = function(callback) {
  this._xserver.fullRead(callback);
};

Presence.setBackend = function(backend) {
  Persistence = backend;
  LocalManager.setBackend(backend);
};

module.exports = Presence;
