var _ = require('underscore'),
    log = require('minilog')('radar:client');

function Client (name, id, accountName, version) {
  this.createdAt = Date.now();
  this.lastModified = Date.now();
  this.name = name;
  this.id = id;
  this.subscriptions = {};
  this.presences = {};
  this.version = version;
}

// Class properties
Client.clients = {};                  // keyed by name
Client.names = {};                    // keyed by id

require('util').inherits(Client, require('events').EventEmitter);

// Public API

// Class methods

// Get current client associated with a given socket id
Client.get = function (id) {
  var name = Client.names[id];
  if (name) {
    return Client.clients[name];
  }
};

// Set up client name/id association, and return new client instance
Client.create = function (request) {
  var options = request.getOptions(),
      message;

  if (options) {
    association = options.association;
    message = request.getMessage();
    Client.names[association.id] = association.name;
    var client = new Client(association.name, association.id,
                            message.accountName, options.clientVersion);

    Client.clients[association.name] = client;

    log.info('create: association name: ' + association.name +
              '; association id: ' + association.id);

    return client;
  }
};

// Instance methods

// Persist subscriptions and presences when not already persisted in memory
Client.prototype.storeData = function (request) {
  var processedOp = false,
      message = request.getMessage();

  // Persist the message data, according to type
  switch(message.op) {
    case 'unsubscribe':
    case 'sync':
    case 'subscribe':
      processedOp = this._storeDataSubscriptions(message);
      break;

    case 'set':
      processedOp = this._storeDataPresences(message);
      break;
  }

  // FIXME: For now log everything Later, enable sample logging. 
  if (processedOp) {
    this._logState();
  }

  return true;
};

Client.prototype.readData = function(cb) {
  var data = {subscriptions: this.subscriptions, presences: this.presences};

  if (cb) {
    cb(data);
  } else {
    return data;
  }
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
      existingSubscription;

  // Persist the message data, according to type
  switch(message.op) {
    case 'unsubscribe':
      if (this.subscriptions[to]) {
        delete this.subscriptions[to];
        return true;
      }
      break;

    case 'sync':
    case 'subscribe':
      existingSubscription = this.subscriptions[to];
      if (!existingSubscription || (existingSubscription.op !== 'sync' && message.op === 'sync')) {
        this.subscriptions[to] = message;
        return true;
      }
  }

  return false;
};

Client.prototype._storeDataPresences = function (messageIn) {
  var message = _cloneForStorage(messageIn),
      to = message.to,
      existingPresence;

  // Persist the message data, according to type
  if (message.op === 'set' && to.substr(0, 'presence:/'.length) == 'presence:/') {
    existingPresence = this.presences[to];

    // Should go offline
    if (existingPresence && messageIn.value === 'offline') {
      delete this.presences[to];
      return true;
    } else if (!existingPresence && message.value !== 'offline') {
      this.presences[to] = message;
      return true;
    }
  }

  return false;
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
