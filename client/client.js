var log = require('minilog')('radar:client'),
    Core = require('../core'),
    _ = require('underscore');

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

  return client;
};

// Instance methods

// Persist subscriptions and presences when not already persisted in memory
Client.prototype.storeData = function (message) {
  var subscriptions = this.subscriptions,
      presences = this.presences,
      changed = false;

  // Persist the message data, according to type
  switch(message.op) {
    case 'unsubscribe':
      if (subscriptions[message.to]) {
        delete subscriptions[message.to];
        changed = true;
      }
      break;

    case 'sync':
    case 'subscribe':
      if (subscriptions[message.to] &&
            !_.isEqual(subscriptions[message.to], message)) {
        subscriptions[message.to] = message;
        changed = true;
      }
      break;

    case 'set':
      if (message.to.substr(0, 'presence:/'.length) == 'presence:/' &&
            presences[message.to] &&
            !_.isEqual(presences[message.to], message)) {
        presences[message.to] = message;
        changed = true;
      }
      break;
  }

  if (changed) {
    this._persist();
  }

  return true;
};

Client.prototype.loadData = function (callback) {
  var self = this;

  // When we touch a client, refresh the TTL
  Core.Persistence.expire(self.key, Client.getDataTTL());

  // Update persisted subscriptions/presences
  Core.Persistence.readKey(self.key, function (clientOld) {
    if (clientOld) {
      self.subscriptions = clientOld.subscriptions;
      self.presences = clientOld.presences;

      if (callback) {
        callback();
      }
    }

    Client.clients[self.name] = self;
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

Client.prototype._persist = function () {
  this.lastModified = Date.now();
  Core.Persistence.persistKey(this.key, this, Client.getDataTTL());
};

module.exports = Client;
