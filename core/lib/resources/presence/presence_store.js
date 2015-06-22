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
PresenceStore.prototype.cacheAdd = function(socketId, message) {
  this.cache[socketId] = message;
};

PresenceStore.prototype.cacheRemove = function(socketId) {
  var val = this.cache[socketId];
  delete this.cache[socketId];
  return val;
};

PresenceStore.prototype.add = function(socketId, userId, userType, message) {
  var store = this,
      events = [];

  logging.debug('#presence - store.add', userId, socketId, message, this.scope);
  this.cacheRemove(socketId);

  if (!this.map[userId]) {
    events.push('user_added');
    this.map[userId] = {};
    this.userTypes[userId] = userType;
  }

  if (!this.map[userId][socketId]) {
    events.push('client_added');
    this.map[userId][socketId] = message;
    this.socketUserMap[socketId] = userId;
  } else {
    var previewsMessage = this.map[userId][socketId];
    if (message.clientData && message.clientData !== previewsMessage.clientData) {
      events.push('client_updated');
      this.map[userId][socketId] = message;
    }
  }

  events.forEach(function(ev) {
    logging.debug('#presence - store.emit', ev, message, store.scope);
    store.emit(ev, message);
  });
};

PresenceStore.prototype.remove = function(socketId, userId, message) {
  var store = this,
      events = [];

  logging.debug('#presence - store.remove', userId, socketId, message, this.scope);
  
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
    logging.debug('#presence - store.emit', ev, message, store.scope);
    store.emit(ev, message);
  });
};

PresenceStore.prototype.removeClient = function(socketId, message) {
  var userId = this.socketUserMap[socketId];
  this.cacheRemove(socketId);

  // When non-existent, return
  if (!userId) {
    logging.warn('#presence - store.removeClient: cannot find data for',
                                                      socketId, this.scope);
    return;
  }

  logging.debug('#presence - store.removeClient', userId, socketId, message, this.scope);
  delete this.map[userId][socketId];
  delete this.socketUserMap[socketId];

  logging.debug('#presence - store.emit', 'client_removed', message, this.scope);
  this.emit('client_removed', message);
};

PresenceStore.prototype.removeUserIfEmpty = function(userId, message) {
  if (this.userExists(userId) && this.userEmpty(userId)) {
    logging.debug('#presence - store.removeUserIfEmpty', userId, message, this.scope);
    delete this.map[userId];
    delete this.userTypes[userId];
    logging.debug('#presence - store.emit', 'user_removed', message, this.scope);
    this.emit('user_removed', message);
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
