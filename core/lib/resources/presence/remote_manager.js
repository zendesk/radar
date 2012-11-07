function RemoteManager() {
  this.remoteClients = new Set();
  this.remoteUsers = new ArraySet();
}

RemoteManager.prototype.hasUser = function(userId) {

};

RemoteManager.prototype.hasClient = function(clientId) {

};

CrossServer.prototype.getOnline = function() {
  var result = {}, self = this;
  function setUid(userId) {
    result[userId] = self.userTypes.get(userId);
  }
  this.remoteUsers.keys().forEach(setUid);
  this.localUsers.keys().forEach(setUid);
  return result;
};

RemoteManager.prototype.queueIfNew = function(cid, uid) {
  var result = [];
  if(!this.hasUser(userId)) {
    result.push(function() {
      this.emit('user_online', userId, this.userTypes.get(userId));
    });
  }
  if(!this.hasClient(clientId)) {
    result.push(function() {
      this.emit('client_online', clientId, userId);
    });
  }
  return result;
};

RemoteManager.prototype.queueIfExists = function(cid, uid) {
  var self = this;
  // order is significant (so that client_offline is emitted before user_offline)
  if(this.hasClient(clientId)) {
    this.emit('client_offline', clientId, userId);
  }
  if(this.hasUser(userId)) {
    this.emit('user_offline', userId, this.userTypes.get(userId));
    this.userTypes.remove(userId);
  }
};

// for receiving messages from Redis
RemoteManager.prototype.message = function() {
  var maxAge = new Date().getTime() - 45 * 1000,
      isOnline = message.online,
      isExpired = (message.at < maxAge),
      uid = message.userId,
      cid = message.clientId,
      userType = message.userType;
  // console.log(message, (isExpired ? 'EXPIRED! ' +(message.at - new Date().getTime())/ 1000 + ' seconds ago'  : ''));
  if(isOnline && !isExpired) {
    var emits = this.queueIfNew(cid, uid);

    this.remoteUsers.push(uid, cid);
    this.remoteClients.add(cid, message);

    emits.forEach(function(c) { c(); });
  } else if((!isOnline || isExpired) && this.remoteUsers.hasKey(uid)) {
    var emits = this.beforeRemove(cid, uid);

    // not online, or expired - and must be a remote user we've seen before (don't send offline for users that we never had online)
    this.remoteUsers.removeItem(uid, cid);
    this.remoteClients.remove(cid);

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
      self.remoteUsers.removeItem(uid, cid);
      self.remoteClients.remove(cid);
      self.emitAfterRemove(cid, uid, false);
    }
  });
};

// perform a full read and return who is online
RemoteManager.prototype.fullRead = function(callback) {
  var self = this;
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
      self._xserver.remoteMessage(message);
    });

    callback && callback(self._xserver.getOnline());
  });
};

module.exports = RemoteManager;
