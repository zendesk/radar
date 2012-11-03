var Set = require('../../map.js'),
    ArraySet = require('./aset.js'),
    Persistence = require('../../persistence.js'),
    logging = require('minilog')('presence');

function CrossServer(scope) {
  this.scope = scope;
  // client lists are simple sets
  this.localClients = new Set();
  this.remoteClients = new Set();
  // user lists are sets of arrays
  this.localUsers = new ArraySet();
  this.remoteUsers = new ArraySet();
  this._disconnectQueue = {};
}

require('util').inherits(CrossServer, require('events').EventEmitter);

CrossServer.prototype.hasUser = function(userId) {
  // user presence is determined by whether at least one client
  // exists in the remote set or the local set
  return this.remoteUsers.hasKey(userId) || this.localUsers.hasKey(userId);
};

CrossServer.prototype.hasClient = function(clientId) {
  return this.remoteClients.has(clientId) || this.localClients.has(clientId);
};

CrossServer.prototype.emitIfNew = function(clientId, userId) {
  if(!this.hasUser(userId)) {
    this.emit('user_online', userId);
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
      this.emit('user_offline', userId);
    }
    // fast path doesn't set a disconnect queue item
  } else {
    console.log('user_offline (queue)', userId, clientId);
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

CrossServer.prototype.addLocal = function(clientId, userId, callback) {
  this.emitIfNew(clientId, userId);
  this.localUsers.push(userId, clientId);
  this.localClients.add(clientId, userId);
  // persist local
  var message = JSON.stringify({
    userId: userId, userType: 0,
    clientId: clientId, online: true, at: new Date().getTime()
  });
  Persistence.persistHash(this.scope, userId + '.' + clientId, message);
  Persistence.publish(this.scope, message, callback);
};

// note: this is the fast path (e.g. graceful only)
CrossServer.prototype.removeLocal = function(clientId, userId, callback) {
  // fast path allows us to do the delete right away
  this.localUsers.removeItem(userId, clientId);
  this.localClients.remove(clientId);
  this.emitAfterRemove(clientId, userId, true);
  // persist local
  Persistence.deleteHash(this.scope, userId + '.' + clientId);
  Persistence.publish(this.scope, JSON.stringify({
    userId: userId, userType: 0,
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
    userId: userId, userType: 0,
    clientId: clientId, online: false, at: new Date().getTime()
  });
  Persistence.persistHash(this.scope, userId + '.' + clientId, message);
  Persistence.publish(this.scope, message);
};

CrossServer.prototype.timeouts = function() {
  this.processLocal();
  this.processRemoteTimeouts();
};

CrossServer.prototype.processLocal = function() {
  var self = this;
  logging.debug('_autoPublish', this.scope);

  this.localUsers.keys().forEach(function(userId) {
    self.localUsers.getItems(userId).forEach(function(clientId) {
      // prevent autopublish for client ids that have been removed
      // but that may still be in the localUsers list, because that
      // list is only updated after the grace period
      console.log('local clients', self.localClients.items,
        self.remoteClients.items,
        self.localClients.has(clientId));
      if(!self.localClients.has(clientId)) { return; }
      userId = parseInt(userId, 10);
      console.log('Autopub - set online', 'userId:', userId, 'clientId:', clientId);
      self.addLocal(clientId, userId);
    });
  });
};

// causes removeRemote() calls
CrossServer.prototype.processRemoteTimeouts = function() {
  var self = this,
      maxAge = new Date().getTime() - 45 * 1000;
  this.remoteClients.forEach(function(cid) {
    var message = self.remoteClients.get(cid),
        isOnline = message.online,
        isExpired = (message.at < maxAge),
        uid = message.userId;

    if(!isOnline || (isOnline && isExpired)) {
      self.remoteUsers.removeItem(uid, cid);
      self.remoteClients.remove(cid);
      self.emitAfterRemove(cid, uid);
    }
  });
};

// causes addRemote() and removeRemote() calls
CrossServer.prototype.remoteMessage = function(message) {
  var maxAge = new Date().getTime() - 45 * 1000,
      isOnline = message.online,
      isExpired = (message.at < maxAge),
      uid = message.userId,
      cid = message.clientId;
  // console.log(message, (isExpired ? 'EXPIRED! ' +(message.at - new Date().getTime())/ 1000 + ' seconds ago'  : ''));
  if(isOnline && !isExpired) {
    this.emitIfNew(cid, uid);
    this.remoteUsers.push(uid, cid);
    this.remoteClients.add(cid, message);
  } else if(!isOnline || (isOnline && isExpired)) {
    this.remoteUsers.removeItem(uid, cid);
    this.remoteClients.remove(cid, message);
    this.emitAfterRemove(cid, uid);
  }
};

CrossServer.prototype._processDisconnects = function() {
  var self = this;
  console.log('_disconnectQueue', this._disconnectQueue);
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
    console.log('disconnect check', userId, self.hasUser(userId));
    if(self.hasUser(userId)) {
      logging.info('Cancel disconnect, as user has reconnected during grace period, userId:', userId);
    } else {
      self.emit('user_offline', userId);
    }
  });
  this._disconnectQueue = {};
};


// without the client ID info
// for sending API replies
CrossServer.prototype.getOnline = function() {
  var result = {};
  function setUid(userId) {
    result[userId] = 0; // FIXME
  }
  this.remoteUsers.keys().forEach(setUid);
  this.localUsers.keys().forEach(setUid);
  return result;
};

module.exports = CrossServer;