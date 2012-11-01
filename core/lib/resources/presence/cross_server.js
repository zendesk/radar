var Set = require('../../map.js'),
    Persistence = require('../../persistence.js'),
    logging = require('minilog')('presence');

function CrossServer() {
  this.remoteUsers = new Set();
  this.remoteClients = new Set();
  this.localUsers = new Set();
  this.localClients = new Set();
}

require('util').inherits(CrossServer, require('events').EventEmitter);

CrossServer.prototype.hasUser = function(userId) {
  return this.remoteUsers.has(userId) || this.localUsers.has(userId);
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

CrossServer.prototype.emitIfExists = function(clientId, userId) {
  if(this.hasClient(clientId)) {
    this.emit('client_offline', clientId, userId);
  }
  if(this.hasUser(userId)) {
    this.emit('user_offline', userId);
  }
};

CrossServer.prototype.addLocal = function(clientId, userId, callback) {
  this.emitIfNew(clientId, userId);
  this.localUsers.add(userId, clientId);
  this.localClients.add(clientId, userId);
  // persist local
  var message = JSON.stringify({
    userId: userId, userType: 0,
    clientId: clientId, online: true, at: new Date().getTime()
  });
  Persistence.persistHash(this.scope, userId, message);
  Persistence.publish(this.scope, message, callback);
};

CrossServer.prototype.removeLocal = function(clientId, userId, callback) {
  this.emitIfExists(clientId, userId);
  this.localUsers.remove(userId);
  this.localClients.remove(clientId);
  // persist local
  Persistence.deleteHash(this.scope, userId);
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
  this.emitIfExists(clientId, userId);
  this.localUsers.remove(userId);
  this.localClients.remove(clientId);
};

CrossServer.prototype.timeouts = function() {
  this.processLocal();
  this.processRemoteTimeouts();
};

CrossServer.prototype.processLocal = function() {
  var self = this;
  logging.debug('_autoPublish', this.name, this._local);

  var now = new Date().getTime();
  this.localUsers.forEach(function(userId) {
    var clientId = self.localUsers.get(userId);
    logging.debug('Autopub - set online', 'userId:', userId);
    self.addLocal(clientId, userId);
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
      this.emitIfExists(cid, uid);
      this.remoteUsers.remove(uid, message);
      this.remoteClients.remove(cid, message);
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
    this.remoteUsers.add(uid, message);
    this.remoteClients.add(cid, message);
  } else if(!isOnline || (isOnline && isExpired)) {
    this.emitIfExists(cid, uid);
    this.remoteUsers.remove(uid, message);
    this.remoteClients.remove(cid, message);
  }
};

// without the client ID info
// for sending API replies
CrossServer.prototype.getOnline = function() {
  var result = {};
  Object.keys(this._byUserId).forEach(function(userId) {
    result[userId] = 0; // userType is always 0 for now
  });
  return result;
};

module.exports = CrossServer;
