var Persistence = require('persistence'),
    logging = require('minilog')('presence');

function DisconnectQueue(parent) {
  this._queue = {};
  this.parent = parent;
}

DisconnectQueue.prototype.push = function(clientId, userId, userType) {
  var self = this;
  if(!this._queue[userId]) {
    this._queue[userId] = [ { clientId: clientId, userType: userType} ];
  } else {
    this._queue[userId].push( { clientId: clientId, userType: userType} );
  }
  setTimeout(function() { self.timeouts(); }, 15000);
};

DisconnectQueue.prototype.timeouts = function() {
  var self = this;
  logging.debug('_disconnectQueue', this._queue);
  Object.keys(this._queue).forEach(function(userId) {
    var userType;
    userId = parseInt(userId, 10);
    // now, remove the queued clientIds from the set of userIds
    // but only if the clientId is not already in remote|localClients
    // because if the clientId were there, then it would have meant
    // that the clientId reconnected...
    var clientIds = self._queue[userId];
    clientIds.forEach(function(item) {
      userType = item.userType;
      if(!self.parent.localClients.has(item.clientId)) {
        Persistence.deleteHash(self.parent.scope, userId + '.' + item.clientId);
      }
    });
    if(self.parent.hasUser(userId)) {
      logging.info('Cancel disconnect, as user has reconnected during grace period, userId:', userId);
    } else {
      logging.info('disconnect user', userId);
      self.parent.emit('user_offline', userId, userType);
      self.parent.userTypes.remove(userId);
    }
  });
  this._queue = {};
};

module.exports = DisconnectQueue;
