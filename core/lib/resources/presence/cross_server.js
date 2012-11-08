var Set = require('../../map.js'),
    ArraySet = require('./aset.js'),
    RemoteManager = require('./remote_manager.js'),
    Persistence = require('../../persistence.js'),
    logging = require('minilog')('presence');

function CrossServer(scope) {
  var self = this;
  this.scope = scope;
  // client lists are simple sets
  this.localClients = new Set();
  // user lists are sets of arrays
  this.localUsers = new ArraySet();
  this._disconnectQueue = {};
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
}

require('util').inherits(CrossServer, require('events').EventEmitter);

CrossServer.prototype.hasUser = function(userId) {
  // user presence is determined by whether at least one client
  // exists in the remote set or the local set
  return this.remoteManager.hasUser(userId) || this.localUsers.hasKey(userId);
};

CrossServer.prototype.hasClient = function(clientId) {
  return this.remoteManager.hasClient(clientId) || this.localClients.has(clientId);
};

CrossServer.prototype.emitIfNew = function(clientId, userId, userType) {
  if(!this.hasUser(userId)) {
    this.emit('user_online', userId, userType);
  }
  if(!this.hasClient(clientId)) {
    this.emit('client_online', clientId, userId);
  }
};

CrossServer.prototype.emitAfterRemove = function(clientId, userId, isFastPath) {
  var self = this;
  // order is significant (so that client_offline is emitted before user_offline)
  if(!this.hasClient(clientId)) {
    this.emit('client_offline', clientId, userId);
  }
  if(isFastPath) {
    if(!this.hasUser(userId)) {
      this.emit('user_offline', userId, this.userTypes.get(userId));
      this.userTypes.remove(userId);
    }
    // fast path doesn't set a disconnect queue item
  } else {
    logging.info('user_offline (queue)', userId, clientId);
    // slow path
    // the disconnect queue needs to be at this level, so that
    // if someone asks for who is online while we the disconnect is pending
    // we still consider that user to be online
    if(!this._disconnectQueue[userId]) {
      this._disconnectQueue[userId] = [ clientId ];
    } else {
      this._disconnectQueue[userId].push( clientId );
    }
    // here, we set a delay for the check
    setTimeout(function() { self._processDisconnects(); }, 15000);
  }
};

CrossServer.prototype.addLocal = function(clientId, userId, userType, callback) {
  this.userTypes.add(userId, userType);
  this.emitIfNew(clientId, userId, userType);
  this.localUsers.push(userId, clientId);
  this.localClients.add(clientId, userId);
  // persist local
  var message = JSON.stringify({
    userId: userId, userType: userType,
    clientId: clientId, online: true, at: new Date().getTime()
  });
  Persistence.persistHash(this.scope, userId + '.' + clientId, message);
  Persistence.publish(this.scope, message, callback);
};

// note: this is the fast path (e.g. graceful only)
CrossServer.prototype.removeLocal = function(clientId, userId, callback) {
  var userType = this.userTypes.get(userId);
  // fast path allows us to do the delete right away
  this.localUsers.removeItem(userId, clientId);
  this.localClients.remove(clientId);
  this.emitAfterRemove(clientId, userId, true);
  // persist local
  Persistence.deleteHash(this.scope, userId + '.' + clientId);
  Persistence.publish(this.scope, JSON.stringify({
    userId: userId, userType: userType,
    clientId: clientId, online: false, at: 0
  }), callback);
};

// causes removeLocal() calls
CrossServer.prototype.disconnectLocal = function(clientId) {
  // send out disconnects for all user id-client-id pairs
  var userId = this.localClients.get(clientId);
  if(userId) {
    // remove from local - if in local at all
    this.localClients.remove(clientId);
    this.emitAfterRemove(clientId, userId, false);
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

CrossServer.prototype.timeouts = function() {
  this.processLocal();
  this.remoteManager.timeouts();
};

CrossServer.prototype.processLocal = function() {
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
CrossServer.prototype.fullRead = function(callback) {
  var self = this;
  this.remoteManager.fullRead(function(result) {
    // merge with the local users for the API response
    function setUid(userId) {
      result[userId] = self.userTypes.get(userId);
    }
    self.localUsers.keys().forEach(setUid);
    callback(result);
  });
};

// causes addRemote() and removeRemote() calls
CrossServer.prototype.remoteMessage = function(message) {
  this.remoteManager.message(message);
};

CrossServer.prototype._processDisconnects = function() {
  var self = this;
  logging.debug('_disconnectQueue', this._disconnectQueue);
  Object.keys(this._disconnectQueue).forEach(function(userId) {
    var userId = parseInt(userId, 10);
    // do not resend the notification for users that are already offline
    if(!self.hasUser(userId)) { return; }
    // now, remove the queued clientIds from the set of userIds
    // but only if the clientId is not already in remote|localClients
    // because if the clientId were there, then it would have meant
    // that the clientId reconnected...
    var clientIds = self._disconnectQueue[userId];
    clientIds.forEach(function(clientId) {
      if(!self.localClients.has(clientId)) {
        self.localUsers.removeItem(userId, clientId);
        Persistence.deleteHash(self.scope, userId + '.' + clientId);
      }
    });
    if(self.hasUser(userId)) {
      logging.info('Cancel disconnect, as user has reconnected during grace period, userId:', userId);
    } else {
      logging.info('disconnect user', userId, self.hasUser(userId));
      self.emit('user_offline', userId, self.userTypes.get(userId));
      self.userTypes.remove(userId);
    }
  });
  this._disconnectQueue = {};
};

CrossServer.setBackend = function(backend) {
  Persistence = backend;
  RemoteManager.setBackend(backend);
};

module.exports = CrossServer;
