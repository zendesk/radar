var PresenceMonitor = require('./presence_monitor.js'),
    logging = require('minilog')('presence');

function PresenceMaintainer(parent) {
  this.parent = parent;
  this._queue = {};
}

// Add user to disconnect queue
PresenceMaintainer.prototype.queue = function(resourceName, userId, userType) {
  this._queue[resourceName] || (this._queue[resourceName] = {});
  this._queue[resourceName][userId] || (this._queue[resourceName][userId] = userType);
};


PresenceMaintainer.prototype.timer = function() {
  var self = this;
  (this._queue != {}) && (logging.debug('execute disconnect queue', this._queue));
  // iterate through the queue
  Object.keys(this._queue).forEach(function(resourceName) {
    var resource = self.parent.channels[resourceName],
        isValid = resource && (resource.type == 'presence');

    var users = self._queue[resourceName];
    Object.keys(users).forEach(function(userId) {
      var isDisconnected = !isValid || !resource._local.has(userId),
          userType = users[userId];
      if(isDisconnected) {
        logging.info('Disconnect - set offline', 'userId:', userId);
        if(isValid) {
          resource.setStatus({ key: userId, type: userType, value: 'offline' });
        } else {
          PresenceMonitor.prototype.set.call({ scope: resourceName }, userId, userType, false);
        }
      } else {
        logging.info('CANCEL DISCONNECT', 'userId:', userId);
      }
    });
  });

  // now empty the queue
  this._queue = {};
};

module.exports = PresenceMaintainer;
