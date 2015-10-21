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
var DEFAULT_DATA_TTL = 86400,
    LOG_WINDOW_SIZE = 10,
    SUBSCRIPTIONS_SUFFIX = '/subscriptions',
    PRESENCES_SUFFIX = '/presences';

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
  var processedOp = false;

  // Persist the message data, according to type
  switch(messageIn.op) {
    case 'unsubscribe':
    case 'sync':
    case 'subscribe':
      processedOp = this._storeDataSubscriptions(messageIn);
      break;

    case 'set':
      processedOp = this._storeDataPresences(messageIn);
      break;
  }

  // FIXME: For now log everything Later, enable sample logging. 
  // if (processedOp && subCount % LOG_WINDOW_SIZE === 0) {
  if (processedOp) {
    this._logState();
  }

  return true;
};

Client.prototype._logState = function() {
  var subCount = Object.keys(this.subscriptions).length,
      presCount = Object.keys(this.presences).length;

  log.info('#storeData', { 
    client_id: this.id,
    subscription_count: subCount,
    presence_count: presCount
  });
};

Client.prototype._storeDataSubscriptions = function (messageIn) {
  var message = _cloneForStorage(messageIn),
      to = message.to,
      subscriptionsKey = this.key + SUBSCRIPTIONS_SUFFIX,
      existingSubscription;

  // Persist the message data, according to type
  switch(message.op) {
    case 'unsubscribe':
      if (this.subscriptions[to]) {
        delete this.subscriptions[to];
        Core.Persistence.expire(subscriptionsKey, Client.getDataTTL());
        Core.Persistence.deleteHash(subscriptionsKey, to);
        return true;
      }
      break;

    case 'sync':
    case 'subscribe':
      existingSubscription = this.subscriptions[to];
      if (!existingSubscription || (existingSubscription.op !== 'sync' && message.op === 'sync')) {
        this.subscriptions[to] = message;
        Core.Persistence.expire(subscriptionsKey, Client.getDataTTL());
        Core.Persistence.persistHash(subscriptionsKey, to, message);
        return true;
      }
  }

  return false;
};

Client.prototype._storeDataPresences = function (messageIn) {
  var message = _cloneForStorage(messageIn),
      to = message.to,
      presencesKey = this.key + PRESENCES_SUFFIX,
      existingPresence;

  // Persist the message data, according to type
  switch(message.op) {
    case 'set':
      if (to.substr(0, 'presence:/'.length) == 'presence:/') {
        existingPresence = this.presences[to];

        // Should go offline
        if (existingPresence && messageIn.value === 'offline') {
          delete this.presences[to];
          Core.Persistence.deleteHash(presencesKey, to);
          return true;
        } else if (!existingPresence && message.value !== 'offline') {
          this.presences[to] = message;
          Core.Persistence.expire(presencesKey, Client.getDataTTL());
          Core.Persistence.persistHash(presencesKey, to, message);
          return true;
        }
      }
      break;
  }

  return false;
};

Client.prototype.loadData = function (callback) {
  var self = this;

  self.readData(function (result) {
    self.presences = result.presences;
    self.subscriptions = result.subscriptions;
  });
};

Client.prototype.readData = function (callback) {
  var self = this,
      result = {};

  self._readDataSubscriptions(function (subscriptions) {
    self._readDataPresences(function(presences){
      callback({
        presences: presences,
        subscriptions: subscriptions
      });
    });
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


Client.prototype._readDataSubscriptions = function (callback) {
  var self = this,
      subscriptionsKey = this.key + SUBSCRIPTIONS_SUFFIX;

  // Get persisted subscriptions
  Core.Persistence.readHashAll(subscriptionsKey, function (replies) {
    callback(replies || {});
  });
};

Client.prototype._readDataPresences = function (callback) {
  var self = this,
      presencesKey = this.key + PRESENCES_SUFFIX;

  // Get persisted presences
  Core.Persistence.readHashAll(presencesKey, function (replies) {
    callback(replies || {});
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
