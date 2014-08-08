var Resource = require('../../resource.js'),
    shasum = require('crypto').createHash('sha1'),
    PresenceManager = require('./presence_manager.js'),
    Sentry = require('./sentry.js'),
    EventEmitter = require('events').EventEmitter,
    logging = require('minilog')('radar:presence');

var default_options = {
  policy: {
    maxPersistence: 12 * 60 * 60 // 12 hours in seconds
  }
};

shasum.update(require('os').hostname() + ' ' + Math.random() + ' ' + Date.now());
var sentryName = shasum.digest('hex').slice(0,15);

function Presence(name, parent, options) {
  Resource.call(this, name, parent, options, default_options);
  this.setup();
}

Presence.sentry = new Sentry(sentryName);
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
  this.manager.on('client_online', function(clientId, userId, userType, userData) {
    logging.info('#presence - client_online', clientId, userId, self.name);
    self.broadcast({
      to: self.name,
      op: 'client_online',
      value: {
        userId: userId,
        clientId: clientId,
        userData: userData,
      }
    });
  });
  this.manager.on('client_offline', function(clientId, userId, explicit) {
    logging.info('#presence - client_offline', clientId, userId, explicit, self.name);
    self.broadcast({
      to: self.name,
      op: 'client_offline',
      explicit: !!explicit,
      value: {
        userId: userId,
        clientId: clientId
      }
    }, clientId);
  });

  //keep track of listeners count
  Presence.resource_count++;
  var sentryListenersCount = EventEmitter.listenerCount(Presence.sentry, 'down');
  if(sentryListenersCount != Presence.resource_count) {
    logging.warn('sentry listener leak detected', sentryListenersCount - Presence.resource_count);
  }
};

Presence.prototype.redisIn = function(message) {
  logging.info('#presence - incoming from #redis', this.name, message, 'subs:', Object.keys(this.subscribers).length );
  this.manager.processRedisEntry(message);
};

Presence.prototype.set = function(client, message) {
  var presence = this,
      userId = message.key;

  function ackCheck() {
    presence.ack(client, message.ack);
  }

  if(message.value != 'offline') {
    // we use subscribe/unsubscribe to trap the "close" event, so subscribe now
    this.subscribe(client);
    this.manager.addClient(client.id, userId, message.type, message.userData, ackCheck);
  } else {
    if(!this.subscribers[client.id]) { //if this is client is not subscribed
      //This is possible if a client does .set('offline') without set-online/sync/subscribe
      Resource.prototype.unsubscribe.call(this, client, message);
    } else {
      // remove from local
      this.manager.removeClient(client.id, userId, message.type, ackCheck);
    }
  }
};

Presence.prototype.unsubscribe = function(client, message) {
  logging.info('#presence - implicit disconnect', client.id, this.name);
  this.manager.disconnectClient(client.id);
  // call parent
  Resource.prototype.unsubscribe.call(this, client, message);
};

Presence.prototype.sync = function(client, message) {
  var self = this;
  this.fullRead(function(online) {
    if(message.options && message.options.version == 2) {
      client.sendJSON({
        op: 'get',
        to: self.name,
        value: self.manager.getClientsOnline()
      });
    } else {
      logging.warn('presence v1 received, sending online', self.name, client.id);
      // will be deprecated when syncs no longer need to use "online" to look like
      // regular messages
      client.sendJSON({
        op: 'online',
        to: self.name,
        value: online
      });
    }
  });
  this.subscribe(client, message);
};

// this is a full sync of the online status from Redis
Presence.prototype.get = function(client, message) {
  var self = this;
  this.fullRead(function(online) {
    logging.debug('get presence', self.manager.getClientsOnline(), message, client && client.id);
    if(message.options && message.options.version == 2) {
      client.sendJSON({
        op: 'get',
        to: self.name,
        value: self.manager.getClientsOnline()
      });
    } else {
      client.sendJSON({
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
  Object.keys(this.subscribers).forEach(function(subscriber) {
    var client = self.parent.server.clients[subscriber];
    if(client && client.id != except) {
      client.sendJSON(message);
    } else {
      logging.warn('#client - not sending: ', (client && client.id), message,  except, self.name);
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
