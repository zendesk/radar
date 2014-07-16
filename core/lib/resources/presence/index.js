var Resource = require('../../resource.js'),
    shasum = require('crypto').createHash('sha1'),
    PresenceManager = require('./presence_manager.js'),
    Sentry = require('./sentry.js'),
    logging = require('minilog')('radar:presence');

var default_options = {
  policy: {
    maxPersistence: 12 * 60 * 60 // 12 hours in seconds
  }
};

shasum.update(require('os').hostname() + ' ' + Math.random() + ' ' + Date.now());
var sentryName = shasum.digest('hex').slice(0,15);
Presence.sentry = new Sentry(sentryName);

function Presence(name, parent, options) {
  Resource.call(this, name, parent, options, default_options);
  this.setup();
}

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
  //This is part of the glorious bullshit parade called sync.
  //Essentially, client_online/online message are not sent to this client until we finish sync,
  //but we should send a final message with all { userId: userType } as a single online message
  //nasty stuff. X-(
  logging.debug('#presence - muting client until sync is completed', client.id, this.name );
  client.radar_presence_muted = true;

  this.fullRead(function(online) {
    logging.debug('#presence - unmuting client, sync is complete', client.id, self.name );
    delete client.radar_presence_muted;
    if(message.options && message.options.version == 2) {
      client.send({
        op: 'get',
        to: self.name,
        value: self.manager.getClientsOnline()
      });
    } else {
      // will be deprecated when syncs no longer need to use "online" to look like
      // regular messages
      client.send({
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
    if(message.options && message.options.version == 2) {
      client.send({
        op: 'get',
        to: self.name,
        value: self.manager.getClientsOnline()
      });
    } else {
      client.send({
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
    if(client && client.id != except && !client.radar_presence_muted) {
      client.send(message);
    } else {
      logging.warn('#client - not sending: ', (client && client.id), message,  except, (client && client.radar_presence_muted), self.name);
    }
  });
};

Presence.prototype.fullRead = function(callback) {
  this.manager.fullRead(callback);
};

Presence.prototype.destroy = function() {
  this.manager.destroy();
};

Presence.setBackend = function(backend) {
  PresenceManager.setBackend(backend);
};

Presence.Sentry = Sentry;

module.exports = Presence;
