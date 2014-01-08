var Resource = require('../../resource.js');
var Persistence = require('../../persistence.js');
var PresenceManager = require('./presence_manager.js');
var logging = require('minilog')('presence');
var EventEmitter = require('events').EventEmitter;

var def_options = {
  policy: { maxPersistence: 12 * 60 * 60 } // 12 hours in seconds
};


function Presence(name, parent, options) {
  var merged = Resource.apply_defaults(options, def_options);
  Resource.call(this, name, parent, merged);
  var self = this;
  this.type = 'presence';

  this._redisEventBus = new EventEmitter();
  this._presenceManager = new PresenceManager(name, Persistence, this._redisEventBus, this.options.policy);

  this._presenceManager.on('user_online', function(userId, clientId, userType, data) {
    logging.info('user_online', userId, clientId, userType);
    var value = {};
    value[userId] = userType;
    self.broadcast({
      to: self.name,
      op: 'online',
      userData: data,
      value: value
    });
  });
  this._presenceManager.on('user_offline', function(userId, clientId, userType) {
    logging.info('user_offline', userId, clientId, userType);
    var value = {};
    value[userId] = userType;
    self.broadcast({
      to: self.name,
      op: 'offline',
      value: value
    });
  });
  this._presenceManager.on('client_online', function(userId, clientId, userType, data) {
    logging.info('client_online', userId, clientId, userType);
    self.broadcast({
      to: self.name,
      op: 'client_online',
      value: {
        userId: userId,
        clientId: clientId,
        userData: data
      }
    });
  });
  this._presenceManager.on('client_offline', function(userId, clientId, userType, data) {
    logging.info('client_offline', userId, clientId, userType);
    self.broadcast({
      to: self.name,
      op: 'client_offline',
      value: {
        userId: userId,
        clientId: clientId
      }
    }, clientId);
  });

}

Presence.prototype = new Resource();

Presence.prototype.redisIn = function(message) {
  if(message) {
    var maxAge = Date.now() - 45 * 1000;

    // messages expire after 45 seconds
    if(message.at >= maxAge) {
      var eventName = message.online ? 'client_online' : 'client_offline';
      this._redisEventBus.emit(eventName, message.userId, message.clientId, message.userType, message.userData, message.hard);
    }
  }
};

var userClientMap = {};

Presence.prototype.setStatus = function(client, message, sendAck) {
  if(arguments.length == 1) {
    message = client; // client and sendAck are optional
  }
  var self = this,
      userId = message.key;

  function ackCheck() {
    sendAck && self.ack(client, sendAck);
  }

  if(message.value != 'offline') {
    userClientMap[client.id] = userId;
    this._presenceManager.online(userId, client.id, message.type, message.userData, ackCheck);
    this.subscribe(client);
  } else {
    delete userClientMap[client.id];
    this._presenceManager.offline(userId, client.id, message.type, message.userData, /*hard*/true, ackCheck);
  }
};

Presence.prototype.unsubscribe = function(client, sendAck) {
  var self = this;

  this._presenceManager.offline(userClientMap[client.id], client.id, /*userType*/undefined, /*data*/undefined, /*hard*/false);
  delete userClientMap[client.id];
  Resource.prototype.unsubscribe.call(this, client, sendAck);
};

Presence.prototype.sync = function(client, message) {
  this.getStatus(client, message);
};

// this is a full sync of the online status from Redis
Presence.prototype.getStatus = function(client, message) {
  var users = this._presenceManager.getUsers();
  if(message.options && message.options.version == 2) {
    client.send({
      op: 'get',
      to: this.name,
      value: users
    });
  } else {
    var usersWithType = {};
    for(var userId in users) {
      usersWithType[userId] = users[userId].userType;
    }

    client.send({
      op: 'get',
      to: this.name,
      value: usersWithType
    });
  }
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
  this._presenceManager.fullRead(callback);
};

Presence.setBackend = function(backend) {
  Persistence = backend;
};

module.exports = Presence;
