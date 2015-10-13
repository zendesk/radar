var _ = require('underscore'),
    log = require('minilog')('radar:client'),
    Core = require('../core');

function Client (name, id, accountName, version) {
  this.createdAt = Date.now();
  this.lastModified = Date.now();
  this.name = name;
  this.id = id;
  this.subscriptions = {};
  this.presences = {};
  this.key = this._keyGet(accountName);
  this.version = version;
}

// 86400:  number of seconds in 1 day
var DEFAULT_DATA_TTL = 86400;

// Class properties
Client.clients = {};                  // keyed by name
Client.names = {};                    // keyed by id
Client.dataTTL = DEFAULT_DATA_TTL;

require('util').inherits(Client, require('events').EventEmitter);

// Public API

// Class methods

// Set/Get the global client TTL
Client.setDataTTL = function (dataTTL) {
  Client.dataTTL = dataTTL;
};

Client.getDataTTL = function () {
  return Client.dataTTL;
};

// Get current client associated with a given socket id
Client.get = function (id) {
  var name = Client.names[id];
  if (name) {
    return Client.clients[name];
  }
};

// Set up client name/id association, and return new client instance
Client.create = function (message) {
  var association = message.options.association;
  Client.names[association.id] = association.name;
  var client = new Client(association.name, association.id,
                            message.accountName, message.options.clientVersion);

  Client.clients[association.name] = client;

  log.info('create: association name: ' + association.name +
            '; association id: ' + association.id);

  return client;
};

// Instance methods

// Persist subscriptions and presences when not already persisted in memory
Client.prototype.storeData = function (messageIn) {
  var subCount = Object.keys(this.subscriptions).length,
      presCount = Object.keys(this.presences).length,
      logNow = false;

  // Persist the message data, according to type
  switch(messageIn.op) {
    case 'unsubscribe':
    case 'sync':
    case 'subscribe':
      logNow = this._storeDataSubscriptions(messageIn, subCount);
      break;

    case 'set':
      logNow = this._storeDataPresences(messageIn);
      break;
  }

  if (logNow) {
    log.info('#storeData: client_id: ' + this.id +
              '; subscription count: ' + subCount +
              '; presence count: ' + presCount);
  }

  return true;
};

Client.prototype._storeDataSubscriptions = function (messageIn, subCount) {
  var message = _cloneForStorage(messageIn),
      to = message.to,
      subscriptionHashname = this.key + '_subs',
      logNow = false,
      lookupMessage;

  // Persist the message data, according to type
  switch(message.op) {
    case 'unsubscribe':
      if (this.subscriptions[to]) {
        delete this.subscriptions[to];
        Core.Persistence.expire(subscriptionHashname, Client.getDataTTL());
        Core.Persistence.deleteHash(subscriptionHashname, to);
        logNow = 0 === subCount % 2;
      }
      break;

    case 'sync':
    case 'subscribe':
      lookupMessage = this.subscriptions[to];
      if (!lookupMessage ||
            (lookupMessage.op != 'sync' && !_.isEqual(lookupMessage, message))) {
        this.subscriptions[to] = message;
        Core.Persistence.expire(subscriptionHashname, Client.getDataTTL());
        Core.Persistence.persistHash(subscriptionHashname, to, message);
        logNow = 0 === subCount % 2;
      }
      break;
  }

  return logNow;
};

Client.prototype._storeDataPresences = function (messageIn, presCount) {
  var message = _cloneForStorage(messageIn),
      to = message.to,
      presenceHashname = this.key + '_pres',
      logNow = false,
      lookupMessage;

  // Persist the message data, according to type
  switch(message.op) {
    case 'set':
      if (to.substr(0, 'presence:/'.length) == 'presence:/') {
        lookupMessage = this.presences[to];
        if (!lookupMessage || (!_.isEqual(lookupMessage, message))) {
          this.presences[to] = message;
          Core.Persistence.expire(presenceHashname, Client.getDataTTL());
          Core.Persistence.persistHash(presenceHashname, to, message);
          logNow = 0 === presCount % 10;
        }
      }
      break;
  }

  return logNow;
};

Client.prototype.loadData = function (callback) {
  var self = this;

  self._loadDataSubscriptions(function () {
    self._loadDataPresences(callback);
  });
};

// Private API

// Instance methods

// Return the key used to persist client data
Client.prototype._keyGet = function (accountName) {
  var key = 'radar_client:/';
  key += accountName ? accountName + '/' : '/';
  key += this.name;

  return key;
};

Client.prototype._loadDataSubscriptions = function (callback) {
  var subscriptionHashname = this.key + '_subs',
      self = this;

  // Get persisted subscriptions
  Core.Persistence.readHashAll(subscriptionHashname, function (replies) {
    self.subscriptions = replies || {};

    if (callback) {
      callback();
    }
  });
};

Client.prototype._loadDataPresences = function (callback) {
  var presenceHashname = this.key + '_pres',
      self = this;

  // Get persisted presences
  Core.Persistence.readHashAll(presenceHashname, function (replies) {
    self.presences = replies || {};

    if (callback) {
      callback();
    }
  });
};

// Private functions
// TODO: move to util module
function _cloneForStorage (messageIn) {
  var message = {};

  message.to = messageIn.to;
  message.op = messageIn.op;

  return message;
}

module.exports = Client;
