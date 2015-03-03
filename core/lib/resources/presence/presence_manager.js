var PresenceStore = require('./presence_store.js'),
    Persistence = require('persistence'),
    logging = require('minilog')('radar:presence_manager');

function PresenceManager(scope, policy, sentry) {
  this.scope  = scope;
  this.policy = policy;
  this.sentry = sentry;
  this.store  = new PresenceStore(scope);
  this.expiryTimers = {};
  this.setup();
}
require('util').inherits(PresenceManager, require('events').EventEmitter);

//filter for message.at for autopublish messages
PresenceManager.autoPubTimeout = 25000;
// messages have expiration (legacy) of 1 hour for limited compatibility with old servers
PresenceManager.messageExpiry = 60*60000;

PresenceManager.prototype.setup = function() {
  var store   = this.store;
  var scope   = this.scope;
  var manager = this;

  store.on('user_added', function(message) {
    manager.emit('user_online', message.userId, message.userType, message.userData);
  });

  store.on('user_removed', function(message) {
    manager.emit('user_offline', message.userId, message.userType);
  });

  store.on('client_added', function(message) {
    manager.emit('client_online', message.clientId, message.userId, message.userType, message.userData, message.state);
  });

  store.on('client_updated', function(message) {
    manager.emit('client_updated', message.clientId, message.userId, message.userType, message.userData, message.state);
  });

  store.on('client_removed', function(message) {
    manager.emit('client_offline', message.clientId, message.userId, message.state, message.explicit);
  });

  // save so you removeListener on destroy
  this.sentryListener = function(sentry) {
    var clientIds = store.clientsForSentry(sentry);

    var chain = function (clientIds) {
      var clientId = clientIds.pop();

      if (!clientId) return;

      logging.info('#presence - #sentry down, removing client:', sentry, scope, clientId);
      manager.sentryDownForClient(clientId);
      setImmediate(function () {
        chain(clientIds);
      });
    };

    chain(clientIds);
  };

  // Listen to all sentries. This should not be costly,
  // since we should not be going down often.
  logging.debug('#presence - add sentry listener', scope);
  this.sentry.on('down', this.sentryListener);
};

PresenceManager.prototype.sentryDownForClient = function(clientId) {
  var userId = this.store.userOf(clientId);
  var userType = this.store.userTypeOf(userId);
  var message = {
    userId: userId,
    userType: userType,
    clientId: clientId,
    online: false,
    explicit: false
  };
  this.stampExpiration(message);
  this.processRedisEntry(message); //directly process
};

PresenceManager.prototype.destroy = function() {
  var manager = this;

  this.store.removeAllListeners();
  Object.keys(this.expiryTimers).forEach(function(userId) {
    manager.clearExpiry(userId);
  });
  if(this.sentryListener) {
    logging.debug('#presence - remove sentry listener', this.scope);
    this.sentry.removeListener('down', this.sentryListener);
    delete this.sentryListener;
  }

  //Client issues a full read and then dies and destroy is called.
  if(this.handleRedisReply) {
    this.handleRedisReply = function() {};
  }

  delete this.store;
};

// for backwards compatibility, add a '.at' to message
PresenceManager.prototype.stampExpiration = function(message) {
  message.at = Date.now() + PresenceManager.messageExpiry;
};

PresenceManager.prototype.addClient = function(clientId, userOpts, callback) {
  var message = {
    userId:   userOpts.userId,
    userType: userOpts.userType,
    userData: userOpts.userData,
    clientId: clientId,
    online:   true,
    state:    userOpts.state || null,
    sentry:   this.sentry.name
  };

  this.stampExpiration(message);

  //we might need the details before we actually do a store.add
  this.store.cacheAdd(clientId, message);

  Persistence.persistHash(this.scope, userOpts.userId + '.' + clientId, message);

  if(this.policy && this.policy.maxPersistence) {
    Persistence.expire(this.scope, this.policy.maxPersistence);
  }

  Persistence.publish(this.scope, message, callback);
};

// explicit disconnect (set('offline'))
PresenceManager.prototype.removeClient = function(clientId, userOpts, callback) {
  var message = {
    userId:   userOpts.userId,
    userType: userOpts.userType,
    clientId: clientId,
    online:   false,
    explicit: true
  };
  this.stampExpiration(message);

  Persistence.deleteHash(this.scope, userOpts.userId + '.' + clientId);
  Persistence.publish(this.scope, message, callback);
};

// implicit disconnect (broken connection)
PresenceManager.prototype.disconnectClient = function(clientId, callback) {
  var userId = this.store.userOf(clientId);
  var userType;
  // if there is no userid, then we've already removed the user (e.g. via a remove call)
  // or, we have not added this client to the store yet. (redis reply for addClient has not come)
  if(!userId) {
    var message = this.store.cacheRemove(clientId);
    if(!message) {
      //this is possible if multiple servers are expiring a fallen server's clients
      logging.warn('#presence - no userId/userType found for', clientId, 'in store, userId:', userId, this.scope);
      return;
    } else {
      userId = message.userId;
      userType = message.userType;
    }
  } else {
    userType = this.store.userTypeOf(userId);
  }
  this._implicitDisconnect(clientId, userId, userType, callback);
};

PresenceManager.prototype._implicitDisconnect = function(clientId, userId, userType, callback) {
  var message = {
    userId: userId,
    userType: userType,
    clientId: clientId,
    online: false,
    explicit: false
  };
  this.stampExpiration(message);

  Persistence.deleteHash(this.scope, userId + '.' + clientId);
  Persistence.publish(this.scope, message, callback);
};

PresenceManager.prototype.isOnline = function(message) {
  return (message.online && //online
      (message.sentry || //with sentry or
       (message.at && message.at >= (Date.now() - PresenceManager.autoPubTimeout)))); //unexpired legacy msg
};

PresenceManager.prototype.isExpired = function(message) {
  return (message.online &&
      !message.sentry &&
      message.at && message.at < (Date.now() - PresenceManager.autoPubTimeout));
};

PresenceManager.prototype.processRedisEntry = function(message, callback) {
  var store = this.store,
      manager = this,
      sentry = this.sentry,
      userId = message.userId,
      clientId = message.clientId,
      userType = message.userType,
      state = message.state;

  logging.debug('#presence - processRedisEntry:', message, this.scope);
  callback = callback || function() {};

  if(this.isOnline(message)) {
    if(!message.sentry) {
      logging.info('#presence - #autopub - received online message without sentry', message, this.scope);
      message.sentry = userId + '.' + clientId;
      //publish fake entry, autopub will renew it
      sentry.publishKeepAlive({ name: message.sentry, save: false });
    }

    if(sentry.isValid(message.sentry)) {
      logging.debug('#presence - processRedisEntry: sentry.isValid true', message.sentry, this.scope);
      manager.clearExpiry(userId);
      store.add(clientId, userId, userType, message);
    } else {
      logging.debug('#presence - processRedisEntry: sentry.isValid false', message.sentry, this.scope);
      //Orphan redis entry: silently remove from redis
      //then remove from store implicitly.
      Persistence.deleteHash(this.scope, userId + '.' + clientId);
      manager.handleOffline(clientId, userId, userType, false/*explicit*/);
    }
    callback();
  } else {
    if(this.isExpired(message)) {
      logging.info('#autopub - received online message - expired', message, this.scope);
      //Orphan autopub redis entry: silently remove from redis
      Persistence.deleteHash(this.scope, userId + '.' + clientId);
      message.explicit = false;
    }

    this.handleOffline(clientId, userId, userType, message.explicit);
    callback();
  }
};

PresenceManager.prototype.handleOffline = function(clientId, userId, userType, explicit) {
  var message = {
    userId: userId,
    userType: userType,
    clientId: clientId,
    online: false,
    explicit: explicit
  };

  //Only if explicit present and false.
  //if user has an expiry timer running, then dont force remove yet
  //Remove user after 15 seconds if no other clients exist
  if(explicit === false || this.isUserExpiring(userId)) {
    this.store.removeClient(clientId, message);
    this.setupExpiry(userId, userType);
  } else {
    this.store.remove(clientId, userId, message);
  }
};


PresenceManager.prototype.isUserExpiring = function(userId) {
  return !!(this.expiryTimers[userId]);
};

PresenceManager.prototype.clearExpiry = function(userId) {
  if(this.expiryTimers[userId]) {
    logging.info('#presence - clear user expiry timeout:', userId, this.scope);
    clearTimeout(this.expiryTimers[userId]);
    delete this.expiryTimers[userId];
  }
};
PresenceManager.prototype.setupExpiry = function(userId, userType) {
  this.clearExpiry(userId);

  if(this.store.userExists(userId)) {
    logging.info('#presence - user expiry setup for', userId, this.scope);
    this.expiryTimers[userId] = setTimeout(this.expireUser.bind(this, userId, userType), this.policy.userExpirySeconds * 1000);
  }
};

PresenceManager.prototype.expireUser = function(userId, userType) {
  var message = { userId: userId, userType: userType };
  logging.info('#presence - trying to remove user after timeout:', userId, this.scope);
  delete this.expiryTimers[userId];
  this.store.removeUserIfEmpty(userId, message);
};

// For sync
PresenceManager.prototype.fullRead = function(callback) {
  var self = this;
  // sync scope presence
  logging.debug('#presence - fullRead', this.scope);

  this.handleRedisReply = function(replies) {
    logging.debug('#presence - fullRead replies', self.scope, replies);
    if(!replies) {
      if (callback) callback(self.getOnline());
      return;
    }

    var count = 0, keys = Object.keys(replies);
    var completed = function() {
      count++;
      if(count == keys.length) {
        if (callback) callback(self.getOnline());
      }
    };
    // process all messages in one go before updating subscribers to avoid
    // sending multiple messages
    keys.forEach(function(key) {
      var message = replies[key];
      self.processRedisEntry(message, completed);
    });
  };

  Persistence.readHashAll(this.scope, function(replies) {
    self.handleRedisReply(replies);
  });
};

//sync v1
PresenceManager.prototype.getOnline = function() {
  var result = {}, store = this.store;
  function setUid(userId) {
    result[userId] = store.userTypeOf(userId);
  }
  this.store.users().forEach(setUid);
  return result;
};

//sync v2
PresenceManager.prototype.getClientsOnline = function() {
  var store = this.store;
  var result = {};

  function processMessage(message) {
    result[message.userId] = result[message.userId] || { clients: { } , userType: message.userType };
    result[message.userId].clients[message.clientId] = {
      userData: message.userData,
      state: message.state
    };
  }

  store.forEachClient(function(uid, cid, message) {
    processMessage(message);
  });
  return result;
};

PresenceManager.prototype.hasUser = function(userId) {
  return this.store.userExists(userId);
};


PresenceManager.setBackend = function(backend) {
  Persistence = backend;
};

module.exports = PresenceManager;
