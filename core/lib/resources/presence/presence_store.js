var logging = require('minilog')('radar:presence_store');

function PresenceStore(scope) {
  this.scope = scope;
  this.map = {};
  this.cache = {};
  this.socketUserMap = {};
  this.userTypes = {};
}

require('util').inherits(PresenceStore, require('events').EventEmitter);

// Cache the client data without adding
PresenceStore.prototype.cacheAdd = function(socketId, data) {
  this.cache[socketId] = data;
};

PresenceStore.prototype.cacheRemove = function(socketId) {
  var val = this.cache[socketId];
  delete this.cache[socketId];
  return val;
};

PresenceStore.prototype.add = function(socketId, userId, userType, data) {
  var store = this,
      events = [];
  logging.debug('#presence - store.add', userId, socketId, data, this.scope);
  this.cacheRemove(socketId);

  if (!this.map[userId]) {
    events.push('user_added');
    this.map[userId] = {};
    this.userTypes[userId] = userType;
  }

  if (!this.map[userId][socketId]) {
    events.push('client_added');
    this.map[userId][socketId] = data;
    this.socketUserMap[socketId] = userId;
  }

  events.forEach(function(ev) {
    logging.debug('#presence - store.emit', ev, data, store.scope);
    store.emit(ev, data);
  });
};

PresenceStore.prototype.remove = function(socketId, userId, data) {
  var store = this,
      events = [];
  logging.debug('#presence - store.remove', userId, socketId, data, this.scope);
  this.cacheRemove(socketId);

  // When non-existent, return
  if (!this.map[userId] || !this.map[userId][socketId]) {
    return;
  }

  events.push('client_removed');
  delete this.map[userId][socketId];
  delete this.socketUserMap[socketId];

  // Empty user
  if (Object.keys(this.map[userId]).length === 0) {
    events.push('user_removed');
    delete this.map[userId];
    delete this.userTypes[userId];
  }

  events.forEach(function(ev) {
    logging.debug('#presence - store.emit', ev, data, store.scope);
    store.emit(ev, data);
  });
};

PresenceStore.prototype.removeClient = function(socketId, data) {
  var userId = this.socketUserMap[socketId];
  this.cacheRemove(socketId);

  // When non-existent, return
  if (!userId) {
    logging.warn('#presence - store.removeClient: cannot find data for',
                                                      socketId, this.scope);
    return;
  }

  logging.debug('#presence - store.removeClient', userId, socketId, data, this.scope);
  delete this.map[userId][socketId];
  delete this.socketUserMap[socketId];

  logging.debug('#presence - store.emit', 'client_removed', data, this.scope);
  this.emit('client_removed', data);
};

PresenceStore.prototype.removeUserIfEmpty = function(userId, data) {
  if (this.userExists(userId) && this.userEmpty(userId)) {
    logging.debug('#presence - store.removeUserIfEmpty', userId, data, this.scope);
    delete this.map[userId];
    delete this.userTypes[userId];
    logging.debug('#presence - store.emit', 'user_removed', data, this.scope);
    this.emit('user_removed', data);
  }
};

PresenceStore.prototype.userOf = function(socketId) {
  return this.socketUserMap[socketId];
};

PresenceStore.prototype.get = function(socketId, userId) {
  return (this.map[userId] && this.map[userId][socketId]);
};

PresenceStore.prototype.users = function() {
  return Object.keys(this.map);
};

PresenceStore.prototype.sockets = function(userId) {
  return ((this.map[userId] && Object.keys(this.map[userId])) || []);
};

PresenceStore.prototype.forEachClient = function(callback) {
  var store = this;
  this.users().forEach(function(userId) {
    store.sockets(userId).forEach(function(socketId) {
      if (callback) callback(userId, socketId, store.get(socketId, userId));
    });
  });
};

PresenceStore.prototype.userEmpty = function(userId) {
  return !!(this.map[userId] && Object.keys(this.map[userId]).length === 0);
};

PresenceStore.prototype.userTypeOf = function(userId) {
  return this.userTypes[userId];
};

PresenceStore.prototype.userExists = function(userId) {
  return !!this.map[userId];
};


// This returns a list of socketIds, which is not costly.  The code that calls
// this code uses each socketId in a separate chained call, the sum of which is
// costly.
PresenceStore.prototype.socketsForSentry = function(sentry) {
  var map = this.map, socketIds = [];
  Object.keys(map).forEach(function(userId) {
    Object.keys(map[userId]).forEach(function(socketId) {
      var data = map[userId][socketId];
      if (data && data.sentry == sentry) {
        socketIds.push(socketId);
      }
    });
  });

  return socketIds;
};

module.exports = PresenceStore;
