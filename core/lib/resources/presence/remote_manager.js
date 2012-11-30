var Set = require('../../map.js'),
    ArraySet = require('./aset.js'),
    Persistence = require('../../persistence.js'),
    logging = require('minilog')('presence');

function RemoteManager(scope, filter) {
  this.name = scope;
  // the purpose of the filter is to prevent local clients from being considered remote
  // during a full read
  this.filter = filter;
  this.remoteClients = new Set();
  this.remoteUsers = new ArraySet();
  this.userTypes = new Set();
}

require('util').inherits(RemoteManager, require('events').EventEmitter);

RemoteManager.prototype.hasUser = function(userId) {
  return this.remoteUsers.hasKey(userId);
};

RemoteManager.prototype.hasClient = function(clientId) {
  return this.remoteClients.has(clientId);
};

RemoteManager.prototype.queueIfNew = function(clientId, userId) {
  var self = this,
      result = [],
      userType = this.userTypes.get(userId);
  if(!this.hasUser(userId)) {
    result.push(function() {
      self.emit('user_online', userId, userType);
    });
  }
  if(!this.hasClient(clientId)) {
    result.push(function() {
      self.emit('client_online', clientId, userId, userType);
    });
  }
  return result;
};

RemoteManager.prototype.queueIfExists = function(clientId, userId) {
  var self = this,
      result = [],
      userType = this.userTypes.get(userId);
  // order is significant (so that client_offline is emitted before user_offline)
  if(this.hasClient(clientId)) {
    result.push(function() {
      self.emit('client_offline', clientId, userId, userType);
    });
  }
  if(this.hasUser(userId)) {
    result.push(function() {
      self.emit('user_offline', userId, userType);
      self.userTypes.remove(userId);
    });
  }
  return result;
};

// for receiving messages from Redis
RemoteManager.prototype.message = function(message) {
  var maxAge = new Date().getTime() - 45 * 1000,
      isOnline = message.online,
      isExpired = (message.at < maxAge),
      uid = message.userId,
      cid = message.clientId,
      userType = message.userType;

  // skip local clientIds
  if(this.filter && this.filter(cid)) {
    return;
  }

  // console.log(message, (isExpired ? 'EXPIRED! ' +(message.at - new Date().getTime())/ 1000 + ' seconds ago'  : ''));
  if(isOnline && !isExpired) {
    this.userTypes.add(uid, userType);
    var emits = this.queueIfNew(cid, uid);

    this.remoteUsers.push(uid, cid);
    this.remoteClients.add(cid, message);

    emits.forEach(function(c) { c(); });
  } else if((!isOnline || isExpired) && this.remoteUsers.hasKey(uid)) {
    var emits = this.queueIfExists(cid, uid);

    // not online, or expired - and must be a remote user we've seen before (don't send offline for users that we never had online)
    this.remoteUsers.removeItem(uid, cid);
    this.remoteClients.remove(cid);
    this.userTypes.remove(uid);

    emits.forEach(function(c) { c(); });
  }
};

// expire existing remote users, causes removeRemote() calls
RemoteManager.prototype.timeouts = function() {
  var self = this,
      maxAge = new Date().getTime() - 45 * 1000;
  this.remoteClients.forEach(function(cid) {
    var message = self.remoteClients.get(cid),
        isOnline = message.online,
        isExpired = (message.at < maxAge),
        uid = message.userId;

    if(!isOnline || (isOnline && isExpired)) {
      var emits = self.queueIfExists(cid, uid);

      self.remoteUsers.removeItem(uid, cid);
      self.remoteClients.remove(cid);
      self.userTypes.remove(uid);

      emits.forEach(function(c) { c(); });
    }
  });
};

// perform a full read and return who is online
RemoteManager.prototype.fullRead = function(callback) {
  var self = this,
      maxAge = new Date().getTime() - 50 * 1000,

  // sync scope presence
  logging.debug('Persistence.readHashAll', this.name);
  Persistence.readHashAll(this.name, function(replies) {
    logging.debug(self.name, 'REPLIES', replies);

    if(!replies) {
      return callback && callback({});
    }

    // process all messages in one go before updating subscribers to avoid
    // sending multiple messages
    Object.keys(replies).forEach(function(key) {
      var data = replies[key];
      try {
        var message = JSON.parse(data);
        if(message.constructor !== Object) {
          throw new Error('JSON parse result is not an Object');
        }
      } catch(err) {
        logging.error('Persistence full read: invalid message', data, err);
        return callback && callback({});
      }
      // remove expired keys
      if(message.at < maxAge) {
        Persistence.deleteHash(self.name, key);
      }
      self.message(message);
    });

    callback && callback(self.getOnline());
  });
};

RemoteManager.prototype.getOnline = function() {
  var result = {}, self = this;
  function setUid(userId) {
    result[userId] = self.userTypes.get(userId);
  }
  this.remoteUsers.keys().forEach(setUid);
  return result;
};

RemoteManager.prototype.getClientsOnline = function() {
  var result = {}, self = this;
  function processMessage(message) {
    if(!result[message.userId]) {
      result[message.userId] = { clients: { } , userType: message.userType };
      result[message.userId].clients[message.clientId] = {};
    } else {
      result[message.userId].clients[message.clientId] = {};
    }
  };

  this.remoteClients.forEach(function(cid) {
    processMessage(self.remoteClients.get(cid));
  });
  return result;
}


RemoteManager.setBackend = function(backend) {
  Persistence = backend;
};

module.exports = RemoteManager;
