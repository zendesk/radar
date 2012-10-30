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
    this.emit('client_online', clientId, userId);
  }
};

// Note: userId is optional - if it is not set, we should remove all user ids
// if it is set, then we should only remove the specific userId
UserCounter.prototype.remove = function(clientId, userId) {
  var index;
  if(userId && this._byUserId[userId]) {
    index = this._byUserId[userId].indexOf(clientId);
    if(index > -1) {
      this._byUserId[userId].splice(index, 1);
    }
    if(this._byUserId[userId].length == 0) {
      // emit user offline
      this.emit('user_offline', userId);
    }
  }
  if(this._byClientId[clientId]) {
    this._byClientId[clientId] = this._byClientId[clientId].filter(function(uid) {
      if(!userId || uid == userId) {
        this.emit('client_offline', clientId, uid);
        return false;
      }
      return true;
    });
  }
};

UserCounter.prototype.has = function(userId) {
  return (this._byUserId[userId] ? this._byUserId[userId].length : 0);
};

// without the client ID info
UserCounter.prototype.items = function() {
  var result = {};
  Object.keys(this._byUserId).forEach(function(userId) {
    result[userId] = 0; // userType is always 0 for now
  });
  return result;
};

module.exports = UserCounter;
