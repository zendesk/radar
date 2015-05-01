var log = require('minilog')('radar:client'),
    Core = require('../core');

function Client (name, id, accountName, version) {
  this.createdAt = Date.now();
  this.lastModified = Date.now();
  this.name = name;
  this.id = id;
  this.key = this._keyGet(accountName);
  this.version = version;
  this.state = STATE_WAIT_FOR_LOAD;
  this.messagesDelayed = [];
  this.subscriptions = {};
  this.presences = {};
}

var STATE_WAIT_FOR_LOAD = 1,
    STATE_LOAD_DONE = 2;

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
Client.dataTTLSet = function (dataTTL) {
  Client.dataTTL = dataTTL;
};

Client.dataTTLGet = function () {
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

// Persist subscriptions and presences
Client.prototype.dataStore = function (message) {
  var subscriptions = this.subscriptions;
  var presences = this.presences;

  if (STATE_WAIT_FOR_LOAD === this.state) {
    this.messagesDelayed.push(message);
    return false;
  }

  // Persist the message data, according to type
  var changed = true;
  switch(message.op) {
    case 'unsubscribe':
      if (subscriptions[message.to]) {
        delete subscriptions[message.to];
      }
      break;

    case 'sync':
    case 'subscribe':
      subscriptions[message.to] = message;
      break;

    case 'set':
      if (message.to.substr(0, 'presence:/'.length) == 'presence:/') {
        presences[message.to] = message;
      }
      break;

    default:
      changed = false;
  }

  if (changed) {
    this._persist();
  }

  return true;
};

Client.prototype.dataLoad = function (callback) {
  var self = this;

  // When we touch a client, refresh the TTL
  Core.Persistence.expire(self.key, Client.dataTTLGet());

  // Update persisted subscriptions/presences
  Core.Persistence.readKey(self.key, function (clientOld) {
    if (clientOld) {
      self.subscriptions = clientOld.subscriptions;
      self.presences = clientOld.presences;

      // Remove obsolete presences
      Client._presencesDelete(self.presences, clientOld.id);

      if (callback) {
        callback();
      }

      self._persist();
    }

    self.state = STATE_LOAD_DONE;
    Client.clients[self.name] = self;
  });
};



// Private API

// Class methods

// Remove old "userId"."socketId" entry from Persistence
Client._presencesDelete = function (presences, socketId) {
  for (var presenceKey in presences) {
    var _hash = presenceKey;
    var _key = presences[presenceKey].key + '.' + socketId;
    Core.Persistence.deleteHash(_hash, _key);
  }
};


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
  Core.Persistence.persistKey(this.key, this, Client.dataTTLGet());
};

module.exports = Client;
