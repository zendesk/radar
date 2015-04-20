var log = require('minilog')('radar:client'),
    Core = require('../core');

function Client (name, id) {
  this.createdAt = Date.now();
  this.lastModified = Date.now();
  this.name = name;
  this.id = id;
  this.subscriptions = {};
  this.presences = {};
};

// 86400:  number of seconds in 1 day
var DEFAULT_DATA_TTL = 86400;

// Class properties
Client.clients = {};            // keyed by name
Client.names = {}               // keyed by id

require('util').inherits(Client, require('events').EventEmitter);

// Public API

// Class methods

// Set up client name/id association, client key, and return client
Client.get = function(id, name, accountName) {
  Client.names[id] = name;
  var client = Client._get(id, name);
  client.key = Client._keyGet(name, accountName);

  return client;
};

// For a given client id/name pair, store the associated message
Client.dataStore = function (id, message) {
  var name;

  if (Client.names[id]) {
    name = Client.names[id];
  }
  else {
    log.error('client id:', id, 'does not have corresponding name');
    return false;
  }

  // Fetch the current instance, or create a new one
  var client = Client._get(id, name);

  subscriptions = client.subscriptions;
  presences = client.presences;

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
      subscriptions[message.to] = message.op;
      break;

    case 'set':
      if (message.to.substr(0, 'presence:/'.length) == 'presence:/') {
        presences[message.to] = message.value;
      }
      break;

    default:
      changed = false;
  }

  if (changed) {
    client.lastModified = Date.now();
    Core.Persistence.persistKey(client.key, client);
    Core.Persistence.expire(client.key, DEFAULT_DATA_TTL);
  }

  return true;
};

// Read client state from persistence, when it exists for a given key
Client.dataFromPersistenceLoad = function (client) {
  if (client.key) {
    // When we touch the client, refresh the TTL
    Core.Persistence.expire(client.key, DEFAULT_DATA_TTL);

    // Update current client with persisted subscriptions/presences
    Core.Persistence.readKey(client.key, function (clientOld) {
      if (clientOld) {
        Client.clients[client.name].subscriptions = clientOld.subscriptions;
        Client.clients[client.name].presences = clientOld.presences;
      }
      Client.clients[client.name].state = STATE_LOAD_DONE;
    });
  }
};


// Private API

// Return the key used to persist client data
Client._keyGet = function (name, accountName) {
  var key= 'radar_client:/';
  key += accountName ? accountName + '/' : '/';
  key += name;

  return key;
};

// Get existing client, or return new client
Client._get = function(id, name) {
  var client = Client.clients[name];
  if (!client) {
    client = new Client(name, id);
    Client.clients[name] = client;
  }

  return client;
};

module.exports = Client;
