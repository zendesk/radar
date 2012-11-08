var Persistence = require('../../persistence.js'),
    logging = require('minilog')('presence');

function DisconnectQueue() {
  this._disconnectQueue = {};
}

DisconnectQueue.prototype.push = function(clientId, userId, userType) {
  if(!this._disconnectQueue[userId]) {
    this._disconnectQueue[userId] = [ clientId ];
  } else {
    this._disconnectQueue[userId].push( clientId );
  }
  setTimeout(function() { self._processDisconnects(); }, 15000);
};

DisconnectQueue.prototype.timeouts = function() {
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

module.exports = DisconnectQueue;
