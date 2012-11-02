var Set = require('./map.js'),
    Persistence = require('./persistence.js'),
    logging = require('minilog')('presence');

function PresenceMonitor(scope) {
  // online represents the current status of all users, including those on different servers
  // key = userId, value = boolean
  this._online = new Set();
  this._clients = new Set();
  this.scope = scope;
};

require('util').inherits(PresenceMonitor, require('events').EventEmitter);

// when a message arrives from Redis, update _online but not _local
// process a single message, whether from an explicit sync or from a Redis subscription
PresenceMonitor.prototype.redisIn = function(message) {
  if(message.op === 'client_offline') {
    this._clients.remove(message.clientId);
  } else {
    if(message.online) {
      if(!this._online.has(message.userId)) {
        this._online.add(message.userId, message.userType);
        this.emit('user_added', message.userId, message.userType, Object.keys(this._clients.items));
      } else {
        this.emit('client_added', message.userId, message.userType, Object.keys(this._clients.items));
      }
      if(message.clientId) {
        this._clients.add(message.clientId, true);
      }
    } else if(!message.online) {
      if(this._online.has(message.userId)) {
        this._online.remove(message.userId);
        this.emit('user_removed', message.userId, message.userType, Object.keys(this._clients.items));
      }
      this._clients.remove(message.clientId);
    } else {
      // logging.warn('PresenceMonitor ignoring message', message);
    }
  }
};

PresenceMonitor.prototype.fullRead = function(callback) {
  var self = this;
  // sync scope presence
  logging.debug('Persistence.readHashAll', this.scope);
  Persistence.readHashAll(this.scope, function(replies) {
    logging.debug(self.scope, 'REPLIES', replies);

    if(!replies) {
      return callback && callback({});
    }

    // process all messages in one go before updating subscribers to avoid
    // sending multiple messages
    var changeOnline = {};
    var changeOffline = {};
    var maxAge = new Date().getTime() - 45 * 1000;
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
      var isOnline = message.online,
          isExpired = (message.at < maxAge);
      logging.info(message, (isExpired ? 'EXPIRED! ' +(message.at - new Date().getTime())/ 1000 + ' seconds ago'  : ''));
      // reminder: there may be multiple online/offline transitions. We want to replay the
      // history here.
      if(isOnline && !isExpired && !self._online.has(message.userId)) {
        changeOnline[message.userId] = message.userType;
        delete changeOffline[message.userId];
      } else if(
        (!isOnline || (isOnline && isExpired))
         && self._online.has(message.userId)) {
        changeOffline[message.userId] = message.userType;
        delete changeOnline[message.userId];
      }
    });

    Object.keys(changeOffline).forEach(function(userId) {
      var userType = changeOffline[userId];
      self._online.remove(userId);
      self.emit('user_removed', userId, userType);
    });
    Object.keys(changeOnline).forEach(function(userId) {
      var userType = changeOnline[userId];
      self._online.add(userId, userType);
      self.emit('user_added', userId, userType);
    });

    logging.info('fullRead changes - offline', changeOffline, ' online', changeOnline, 'result', self._online.items);

    callback && callback(self._online.items, Object.keys(self._clients.items));
  });
};

PresenceMonitor.prototype.set = function(userId, userType, online, clientId, callback) {
  if(online) {
    var message = JSON.stringify({ userId: userId, userType: userType, online: true, at: new Date().getTime(), clientId: clientId});
    Persistence.persistHash(this.scope, userId, message);
    Persistence.persistOrdered(this.scope + '/clients', clientId);
    Persistence.publish(this.scope, message, callback);
  } else {
    Persistence.deleteHash(this.scope, userId);
    Persistence.removeOrdered(this.scope + '/clients', clientId);
    Persistence.publish(this.scope, JSON.stringify({ userId: userId, userType: userType, online: false, at: 0, clientId: clientId}), callback);
  }
};

PresenceMonitor.prototype.setClientOffline = function(userId, userType, clientId, callback) {
  this._clients.remove(clientId);
  Persistence.removeOrdered(this.scope + '/clients', clientId);
  Persistence.publish(this.scope, JSON.stringify({ op: 'client_offline', userId: userId, userType: userType, clientId: clientId }), callback);
};

PresenceMonitor.setBackend = function(backend) { Persistence = backend; };

module.exports = PresenceMonitor;
