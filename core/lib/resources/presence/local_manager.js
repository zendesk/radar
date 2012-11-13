var Set = require('../../map.js'),
    ArraySet = require('./aset.js'),
    RemoteManager = require('./remote_manager.js'),
    DisconnectQueue = require('./disconnect_queue.js'),
    Persistence = require('../../persistence.js'),
    logging = require('minilog')('presence');

function LocalManager(scope) {
  var self = this;
  this.scope = scope;
  // client lists are simple sets
  this.localClients = new Set();
  // user lists are sets of arrays
  this.localUsers = new ArraySet();
  // user type information (assumed to be same each userId)
  this.userTypes = new Set();

  this.remoteManager = new RemoteManager(scope, function(clientId) {
    return self.localClients.has(clientId);
  });

  this.remoteManager.on('user_online', function(userId, userType) {
    // if the userId is not in the local set, emit it
    if(!self.localUsers.hasKey(userId)) {
      self.emit('user_online', userId, userType);
    }
  });

  this.remoteManager.on('user_offline', function(userId, userType) {
    // if the user is not in the local set, then it is offline
    // otherwise, the local set determines whether the user is offline
    if(!self.localUsers.hasKey(userId)) {
      self.emit('user_offline', userId, userType);
    }
  });

  this.remoteManager.on('client_online', function(clientId, userId, userType) {
    // if the clientId is not in the local set, emit it
    if(!self.localClients.has(clientId)) {
      self.emit('client_online', clientId, userId, userType);
    }
  });

  this.remoteManager.on('client_offline', function(clientId, userId, userType) {
    if(!self.localClients.has(clientId)) {
      self.emit('client_offline', clientId, userId, userType);
    }
  });

  this._disconnectQueue = new DisconnectQueue(this);
}

require('util').inherits(LocalManager, require('events').EventEmitter);

LocalManager.prototype.hasUser = function(userId) {
  // user presence is determined by whether at least one client
  // exists in the remote set or the local set
  return this.remoteManager.hasUser(userId) || this.localUsers.hasKey(userId);
};

LocalManager.prototype.hasClient = function(clientId) {
  return this.remoteManager.hasClient(clientId) || this.localClients.has(clientId);
};

LocalManager.prototype.addLocal = function(clientId, userId, userType, callback) {
  this.userTypes.add(userId, userType);
  if(!this.hasUser(userId)) {
    this.emit('user_online', userId, userType);
  }
  if(!this.hasClient(clientId)) {
    this.emit('client_online', clientId, userId);
  }
  this.localUsers.push(userId, clientId);
  // persist local
  var message = {
      userId: userId, userType: userType,
      clientId: clientId, online: true, at: new Date().getTime()
    },
    pmessage = JSON.stringify(message);
  this.localClients.add(clientId, message);
  Persistence.persistHash(this.scope, userId + '.' + clientId, pmessage);
  Persistence.publish(this.scope, pmessage, callback);
};

// note: this is the fast path (e.g. graceful only)
LocalManager.prototype.removeLocal = function(clientId, userId, callback) {
  var userType = this.userTypes.get(userId);
  // fast path allows us to do the delete right away
  this.localUsers.removeItem(userId, clientId);
  this.localClients.remove(clientId);

  // order is significant (so that client_offline is emitted before user_offline)
  if(!this.hasClient(clientId)) {
    this.emit('client_offline', clientId, userId);
  }

  // fast path doesn't set a disconnect queue item
  if(!this.hasUser(userId)) {
    this.emit('user_offline', userId, this.userTypes.get(userId));
    this.userTypes.remove(userId);
  }

  // persist local
  Persistence.deleteHash(this.scope, userId + '.' + clientId);
  Persistence.publish(this.scope, JSON.stringify({
    userId: userId, userType: userType,
    clientId: clientId, online: false, at: 0
  }), callback);
};

// causes removeLocal() calls
LocalManager.prototype.disconnectLocal = function(clientId) {
  // send out disconnects for all user id-client-id pairs
  var message = this.localClients.get(clientId),
      userId = (message && message.userId ? message.userId : false);
  if(userId) {
    // remove from local - if in local at all
    this.localUsers.removeItem(userId, clientId);
    this.localClients.remove(clientId);

    // order is significant (so that client_offline is emitted before user_offline)
    if(!this.hasClient(clientId)) {
      this.emit('client_offline', clientId, userId);
    }
    logging.info('user_offline (queue)', userId, clientId);
    // slow path
    // the disconnect queue needs to be at this level, so that
    // if someone asks for who is online while we the disconnect is pending
    // we still consider that user to be online
    this._disconnectQueue.push(clientId, userId, this.userTypes.get(userId));
  }
  // note: do not delete the hash key yet.
  // the slow path should apply here
  // e.g. users should only be dropped when the at value expires
  var message = JSON.stringify({
    userId: userId, userType: this.userTypes.get(userId),
    clientId: clientId, online: false, at: new Date().getTime()
  });
  Persistence.persistHash(this.scope, userId + '.' + clientId, message);
  Persistence.publish(this.scope, message);
};

LocalManager.prototype.timeouts = function() {
  this.processLocal();
  this.remoteManager.timeouts();
};

LocalManager.prototype.processLocal = function() {
  var self = this;
  logging.debug('_autoPublish', this.scope);

  this.localUsers.keys().forEach(function(userId) {
    self.localUsers.getItems(userId).forEach(function(clientId) {
      // prevent autopublish for client ids that have been removed
      // but that may still be in the localUsers list, because that
      // list is only updated after the grace period
      if(!self.localClients.has(clientId)) { return; }
      userId = parseInt(userId, 10);
      logging.debug('Autopub - set online', 'userId:', userId, 'clientId:', clientId);
      self.addLocal(clientId, userId, self.userTypes.get(userId));
    });
  });
};

// takes into account both local and remote results
LocalManager.prototype.fullRead = function(callback) {
  var self = this;
  // get the remotely online users
  this.remoteManager.fullRead(function(result) {
    // merge with the local users for the API response
    function setUid(userId) {
      result[userId] = self.userTypes.get(userId);
    }
    self.localUsers.keys().forEach(setUid);
    // also merge with the disconnect queue
    Object.keys(self._disconnectQueue._queue).forEach(setUid);
    callback(result);
  });
};

LocalManager.prototype.getClientsOnline = function() {
  // assume a full read was done before this
  var self = this,
      result = this.remoteManager.getClientsOnline();
  // merge with the local users for the API response
  function processMessage(message) {
    if(!result[message.userId]) {
      result[message.userId] = { clients: { } , userType: message.userType };
      result[message.userId].clients[message.clientId] = {};
    } else {
      result[message.userId].clients[message.clientId] = {};
    }
  };
  this.localClients.forEach(function(cid){
    processMessage(self.localClients.get(cid));
  });
  // TODO: the disconnect queue is not reflected in the response
  return result;
};

// causes addRemote() and removeRemote() calls
LocalManager.prototype.remoteMessage = function(message) {
  this.remoteManager.message(message);
};

LocalManager.prototype._processDisconnects = function() {
  this._disconnectQueue.timeouts();
};

LocalManager.setBackend = function(backend) {
  Persistence = backend;
  RemoteManager.setBackend(backend);
};

module.exports = LocalManager;
