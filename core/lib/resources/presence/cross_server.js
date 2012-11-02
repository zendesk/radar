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

CrossServer.prototype.isLocal = function(clientId) {
  return this.local.hasClient(clientId);
};

CrossServer.prototype.emitIfNew = function(clientId, userId) {
  if(!this.hasUser(userId)) {
    this.emit('user_online', userId);
  }
  if(!this.hasClient(clientId)) {
    this.emit('client_online', clientId, userId);
  }
};

CrossServer.prototype.emitAfterRemove = function(clientId, userId) {
  // order is significant (so that client_offline is emitted before user_offline)
  if(!this.hasClient(clientId)) {
    this.emit('client_offline', clientId, userId);
  }
  if(!this.hasUser(userId)) {
    this.emit('user_offline', userId);
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

CrossServer.prototype.removeLocal = function(clientId, userId, callback) {
  this.localUsers.removeItem(userId, clientId);
  this.localClients.remove(clientId);
  this.emitAfterRemove(clientId, userId);
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
  // remove from local - if in local at all
  this.localUsers.removeItem(userId, clientId);
  this.localClients.remove(clientId);
  this.emitAfterRemove(clientId, userId);
  // persist local
  Persistence.deleteHash(this.scope, userId + '.' + clientId);
  Persistence.publish(this.scope, JSON.stringify({
    userId: userId, userType: 0,
    clientId: clientId, online: false, at: 0
  }));
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
        isExpired = (message.at < maxAge);

    if(!isOnline || (isOnline && isExpired)) {
      this.remoteUsers.removeItem(uid, cid);
      this.remoteClients.remove(cid);
      this.emitAfterRemove(cid, uid);
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
  logging.info(message, (isExpired ? 'EXPIRED! ' +(message.at - new Date().getTime())/ 1000 + ' seconds ago'  : ''));
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
