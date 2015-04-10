var log = require('minilog')('radar:client'),
    Core = require('../core');

function Client (name, id) {
  this.createdAt = Date.now();
  this.timestamp = Date.now();
  this.name = name;
  this.id = id;
  this.subscriptions = {};
  this.presences = {};
};

// 86400000:  number of milliseconds in 1 day
var DEFAULT_DATA_TTL = 86400000;

// 900000:  number of milliseconds in 15 minutes
var DEFAULT_DATA_PERIOD = 900000;

// Class properties
Client.serverName;
Client.clients = {};
Client.names = {}

require('util').inherits(Client, require('events').EventEmitter);

// Public API

// Class methods
Client.serverNameSet = function (serverName) {
  Client.serverName = serverName;
};

Client.nameSet = function(id, name) {
  Client.names[id] = name;
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
      client.timestamp = Date.now();
      subscriptions[message.to] = message.op;
      break;

    case 'set':
      client.timestamp = Date.now();
      if (message.to.substr(0, 'presence:/'.length) == 'presence:/') {
        presences[message.to] = message.value;
      }
      break;

    default:
      changed = false;
  }

  // TODO: perhaps do this every N "stores"
  if (changed) {
    Core.Persistence.persistHash(Client.serverName, name, client);
  }

  return true;
};

Client.dataSetup = function (configuration) {
  Client.dataTTL = configuration.dataTTL || DEFAULT_DATA_TTL;
  Client.dataPeriod =
        configuration.dataPeriod || DEFAULT_DATA_PERIOD;

  Client._dataFromPersistenceLoad();

  Client.timer = Client._dataPurgeSchedule();
};

// Private API

Client._get = function(id, name) {
  var client;

  if (!Client.names[id]) {
    log.error('_get:', id, 'does not have corresponding name');
  }
  else {
    client = Client.clients[name];
    if (!client) {
      client = new Client(name, id);
      Client.clients[name] = client;
    }
  }

  return client;
};

// For each client, purge aged-out client data
Client._dataPurgeSchedule = function() {
  Object.keys(Client.clients).forEach(this._dataPurge.bind(this));
  this.timer = setTimeout(this._dataPurgeSchedule.bind(this),
                                  Client.dataPeriod);
};

// For a given client name, remove client data from persistence and from memory
Client._dataPurge = function(name) {
  if (Client.clients[name] &&
          !Client._dataIsCurrent(name, Client.clients[name].timestamp)) {
    Core.Persistence.deleteHash(Client.serverName, name);
    delete Client.clients[name];

    log.info('#_dataPurge - remove data for client name:', name);
  }
};

// Read client state from persistence, deleting expired data on load
Client._dataFromPersistenceLoad = function () {
  Core.Persistence.readHashAll(this.name, function (valueObj) {
    var vo = valueObj || {};

    Object.keys(vo).forEach(function (name) {
      if (!Client._dataIsCurrent(name, vo[name].timestamp)) {
        log.info('#_dataFromPersistenceLoad: Drop persistence data for name:', name);
        Core.Persistence.deleteHash(Client.serverName, name);
      }
      else {
        Client.clients[name] = vo[name];
      }
    });
  });
};

// Determine whether or not client data is current for a given name
Client._dataIsCurrent = function(name, timestamp) {
  var current = timestamp + Client.dataTTL >= Date.now();

  log.debug('_dataIsCurrent', name, current,
                    !!timestamp ? timestamp : 'not-present');
  return current;
};


module.exports = Client;
