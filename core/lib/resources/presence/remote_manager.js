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

// for receiving messages from Redis
RemoteManager.prototype.message = function(message, skipTimeouts) {
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

  // to process messages, we'll set each
  this.userTypes.add(uid, userType);
  if(isOnline && !isExpired) {
    var emits = this.queueIfNew(cid, uid);

    this.remoteUsers.push(uid, cid);
    this.remoteClients.add(cid, message);

    emits.forEach(function(c) { c(); });
  } else {
    // for not online, we'll just update the message in remoteClients
    // and let the timeouts step handle the rest.
    this.remoteClients.add(cid, message);
  }
  if(!skipTimeouts) {
    // now, check each client for a timeout
    this.timeouts();
  }
};

// expire existing remote users, causes removeRemote() calls
RemoteManager.prototype.timeouts = function() {
  var self = this,
      maxAge = new Date().getTime() - 45 * 1000,
      // need to snapshot here so that we can detect which ones are missing
      oldKeys = this.remoteUsers.keys();

  this.remoteClients.forEach(function(cid) {
    var message = self.remoteClients.get(cid),
        isOnline = message.online,
        isExpired = (message.at < maxAge),
        uid = message.userId;

    if(!isOnline || (isOnline && isExpired)) {
      var emits = [],
          userType = self.userTypes.get(uid);

      self.remoteUsers.removeItem(uid, cid);

      if(self.hasClient(cid)) {
        emits.push(function() {
          self.emit('client_offline', cid, uid, userType);
        });
      }

      self.remoteClients.remove(cid);

      emits.forEach(function(c) { c(); });
    }
  });
  // check if the removal of the client ids resulted in an empty user
  oldKeys.forEach(function(userId) {
    if(!self.hasUser(userId)) {
      self.emit('user_offline', userId, self.userTypes.get(userId));
      self.userTypes.remove(userId);
    }
  });
};

// perform a full read and return who is online
RemoteManager.prototype.fullRead = function(callback) {
  var self = this,
      maxAge = new Date().getTime() - 50 * 1000;
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
      self.message(message, true);
    });

    self.timeouts();

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
