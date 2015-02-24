var logging = require('minilog')('radar:presence_store');

function PresenceStore(scope) {
  this.scope = scope;
  this.map = {};
  this.cache = {};
  this.clientUserMap = {};
  this.userTypes = {};
}

require('util').inherits(PresenceStore, require('events').EventEmitter);

// Cache the client data without adding
PresenceStore.prototype.cacheAdd = function(clientId, data) {
  this.cache[clientId] = data;
};

PresenceStore.prototype.cacheRemove = function(clientId) {
  var val = this.cache[clientId];
  delete this.cache[clientId];
  return val;
};

PresenceStore.prototype.add = function(clientId, userId, userType, data) {
  var store = this,
      events = [];
  logging.debug('#presence - store.add', userId, clientId, data, this.scope);
  this.cacheRemove(clientId);

  if(!this.map[userId]) {
    events.push('user_added');
    this.map[userId] = {};
    this.userTypes[userId] = userType;
  }

  if(!this.map[userId][clientId]) {
    events.push('client_added');
    this.map[userId][clientId] = data;
    this.clientUserMap[clientId] = userId;
  }

  events.forEach(function(ev) {
    logging.debug('#presence - store.emit', ev, data, store.scope);
    store.emit(ev, data);
  });
};

PresenceStore.prototype.remove = function(clientId, userId, data) {
  var store = this,
      events = [];
  logging.debug('#presence - store.remove', userId, clientId, data, this.scope);
  this.cacheRemove(clientId);

  // When non-existent, return
  if(!this.map[userId] || !this.map[userId][clientId]) {
    return;
  }

  events.push('client_removed');
  delete this.map[userId][clientId];
  delete this.clientUserMap[clientId];

  // Empty user
  if(Object.keys(this.map[userId]).length === 0) {
    events.push('user_removed');
    delete this.map[userId];
    delete this.userTypes[userId];
  }

  events.forEach(function(ev) {
    logging.debug('#presence - store.emit', ev, data, store.scope);
    store.emit(ev, data);
  });
};

PresenceStore.prototype.removeClient = function(clientId, data) {
  var userId = this.clientUserMap[clientId];
  this.cacheRemove(clientId);

  // When non-existent, return
  if(!userId) {
    logging.warn('#presence - store.removeClient: cannot find data for',
                                                      clientId, this.scope);
    return;
  }

  logging.debug('#presence - store.removeClient', userId, clientId, data, this.scope);
  delete this.map[userId][clientId];
  delete this.clientUserMap[clientId];

  logging.debug('#presence - store.emit', 'client_removed', data, this.scope);
  this.emit('client_removed', data);
};

PresenceStore.prototype.removeUserIfEmpty = function(userId, data) {
  if(this.userExists(userId) && this.userEmpty(userId)) {
    logging.debug('#presence - store.removeUserIfEmpty', userId, data, this.scope);
    delete this.map[userId];
    delete this.userTypes[userId];
    logging.debug('#presence - store.emit', 'user_removed', data, this.scope);
    this.emit('user_removed', data);
  }
};

PresenceStore.prototype.userOf = function(clientId) {
  return this.clientUserMap[clientId];
};

PresenceStore.prototype.get = function(clientId, userId) {
  return (this.map[userId] && this.map[userId][clientId]);
};

PresenceStore.prototype.users = function() {
  return Object.keys(this.map);
};

PresenceStore.prototype.clients = function(userId) {
  return ((this.map[userId] && Object.keys(this.map[userId])) || []);
};

PresenceStore.prototype.forEachClient = function(callback) {
  var store = this;
  this.users().forEach(function(userId) {
    store.clients(userId).forEach(function(clientId) {
      if(callback) callback(userId, clientId, store.get(clientId, userId));
    });
  });
};

PresenceStore.prototype.userEmpty = function(userId) {
  if(this.map[userId] &&
     Object.keys(this.map[userId]).length === 0) {
    return true;
  }
  return false;
};

PresenceStore.prototype.userTypeOf = function(userId) {
  return this.userTypes[userId];
};

PresenceStore.prototype.userExists = function(userId) {
  return !!this.map[userId];
};


// This returns a list of clientIds, which is not costly.  The code that calls
// this code uses each clientId in a separate chained call, the sum of which is
// costly.
PresenceStore.prototype.clientsForSentry = function(sentry) {
  var map = this.map, clientIds = [];
  Object.keys(map).forEach(function(userId) {
    Object.keys(map[userId]).forEach(function(clientId) {
      var data = map[userId][clientId];
      if (data && data.sentry == sentry) {
        clientIds.push(clientId);
      }
    });
  });

  return clientIds;
};

module.exports = PresenceStore;
