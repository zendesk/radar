function UserCounter() {
  this._byUserId = {};
  this._byClientId = {};
}

require('util').inherits(UserCounter, require('events').EventEmitter);

UserCounter.prototype.add = function(clientId, userId) {
  // add, ignoring duplicate adds
  this._byUserId[userId] || (this._byUserId[userId] = []);
  if(this._byUserId[userId].indexOf(clientId) == -1) {
    this._byUserId[userId].push(clientId);
    // emit user added
    this.emit('user_online', userId);
  }
  this._byClientId[clientId] || (this._byClientId[clientId] = []);
  if(this._byClientId[clientId].indexOf(userId) == -1) {
    this._byClientId[clientId].push(userId);
  }
};

UserCounter.prototype.remove = function(clientId, userId) {
  var index, self = this;
  if(this._byClientId[clientId]) {
    this._byClientId[clientId] = this._byClientId[clientId].filter(function(uid) {
      if(!userId || uid == userId) {
        self.emit('client_offline', clientId, uid);
        return false;
      }
      return true;
    });
  }
  // order is significant (so that client_offline is emitted before user_offline)
  if(this._byUserId[userId]) {
    index = this._byUserId[userId].indexOf(clientId);
    if(index > -1) {
      this._byUserId[userId].splice(index, 1);
    }
    if(this._byUserId[userId].length == 0) {
      // emit user offline
      this.emit('user_offline', userId);
    }
  }
};

// for checking wheter a user is online
UserCounter.prototype.has = function(userId) {
  return (this._byUserId[userId] ? this._byUserId[userId].length : 0);
};

// for fetching the user IDs associated with a client ID
UserCounter.prototype.getByClientId = function(clientId) {
  return this._byClientId[clientId];
};

module.exports = UserCounter;
