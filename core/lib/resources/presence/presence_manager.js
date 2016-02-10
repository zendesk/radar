var _ = require('underscore')
var PresenceStore = require('./presence_store.js')
var Persistence = require('persistence')
var Minilog = require('minilog')
var logging = Minilog('radar:presence_manager')

function PresenceManager (scope, policy, sentry) {
  this.scope = scope
  this.policy = policy
  this.sentry = sentry
  this.store = new PresenceStore(scope)
  this.expiryTimers = {}
  this.setup()
  this.destroying = false
}

require('util').inherits(PresenceManager, require('events').EventEmitter)

PresenceManager.prototype.setup = function () {
  var store = this.store
  var self = this

  store.on('user_added', function (message) {
    self.emit('user_online', message.userId, message.userType,
      message.userData)
  })

  store.on('user_removed', function (message) {
    self.emit('user_offline', message.userId, message.userType)
  })

  store.on('client_added', function (message) {
    self.emit('client_online', message.clientId, message.userId,
      message.userType, message.userData,
      message.clientData)
  })

  store.on('client_updated', function (message) {
    self.emit('client_updated', message.clientId, message.userId,
      message.userType, message.userData,
      message.clientData)
  })

  store.on('client_removed', function (message) {
    self.emit('client_offline', message.clientId, message.userId,
      message.explicit)
  })
}

PresenceManager.prototype.destroy = function () {
  var self = this

  this.destroying = true

  this.store.removeAllListeners()
  Object.keys(this.expiryTimers).forEach(function (userId) {
    self.clearExpiry(userId)
  })

  // Client issues a full read and then dies and destroy is called
  if (this.handleRedisReply) {
    this.handleRedisReply = function () {}
  }

  delete this.store
}
// FIXME: Method signature is getting unmanageable
PresenceManager.prototype.addClient = function (clientSessionId, userId, userType,
  userData, clientData, callback) {
  if (typeof clientData === 'function') {
    callback = clientData
  }

  var message = {
    userId: userId,
    userType: userType,
    userData: userData,
    clientId: clientSessionId,
    online: true,
    sentry: this.sentry.name
  }

  if (clientData) { message.clientData = clientData }

  // We might need the details before we actually do a store.add
  this.store.cacheAdd(clientSessionId, message)

  Persistence.persistHash(this.scope, userId + '.' + clientSessionId, message)

  if (this.policy && this.policy.maxPersistence) {
    Persistence.expire(this.scope, this.policy.maxPersistence)
  }

  Persistence.publish(this.scope, message, callback)
}

// Explicit disconnect (set('offline'))
PresenceManager.prototype.removeClient = function (clientSessionId, userId, userType, callback) {
  var message = {
    userId: userId,
    userType: userType,
    clientId: clientSessionId,
    online: false,
    explicit: true
  }

  Persistence.deleteHash(this.scope, userId + '.' + clientSessionId)
  Persistence.publish(this.scope, message, callback)
}

// Implicit disconnect (broken connection)
PresenceManager.prototype.disconnectClient = function (clientSessionId, callback) {
  var userId = this.store.userOf(clientSessionId)
  var userType

  // If there is no userid, then we've already removed the user (e.g. via a remove
  // call) or, we have not added this client to the store yet. (redis reply for
  // addClient has not come)
  if (!userId) {
    var message = this.store.cacheRemove(clientSessionId)
    if (!message) {
      // This is possible if multiple servers are expiring a fallen server's clients
      logging.warn('#presence - no userId/userType found for', clientSessionId,
        'in store, userId:', userId, this.scope)
      return
    } else {
      userId = message.userId
      userType = message.userType
    }
  } else {
    userType = this.store.userTypeOf(userId)
  }
  this._implicitDisconnect(clientSessionId, userId, userType, callback)
}

PresenceManager.prototype.disconnectRemoteClient = function (clientSessionId, callback) {
  // send implicit disconnect to our subscribers, but dont publish via redis
  var userId = this.store.userOf(clientSessionId)
  var userType = this.store.userTypeOf(userId)
  var self = this

  var message = {
    userId: userId,
    userType: userType,
    clientId: clientSessionId,
    online: false,
    explicit: false
  }

  setImmediate(function () {
    self.processRedisEntry(message, callback)
  })
}

PresenceManager.prototype._implicitDisconnect = function (clientSessionId, userId,
  userType, callback) {
  var message = {
    userId: userId,
    userType: userType,
    clientId: clientSessionId,
    online: false,
    explicit: false
  }

  Persistence.deleteHash(this.scope, userId + '.' + clientSessionId)
  Persistence.publish(this.scope, message, callback)
}

PresenceManager.prototype.processRedisEntry = function (message, callback) {
  var store = this.store
  var self = this
  var sentry = this.sentry
  var userId = message.userId
  var clientSessionId = message.clientId
  var userType = message.userType

  logging.debug('#presence - processRedisEntry:', message, this.scope)
  callback = callback || function () {}

  if (message.online) {
    var isDown = sentry.isDown(message.sentry)
    if (!isDown) {
      self.clearExpiry(userId)
      store.add(clientSessionId, userId, userType, message)
    } else {
      logging.debug('#presence - processRedisEntry: sentry.isDown', isDown,
        message.sentry, this.scope)
      // Orphan redis entry: silently remove from redis then remove from store
      // implicitly.
      Persistence.deleteHash(this.scope, userId + '.' + clientSessionId)
      self.handleOffline(clientSessionId, userId, userType, false /* explicit */)
    }
    callback()
  } else {
    this.handleOffline(clientSessionId, userId, userType, message.explicit)
    callback()
  }
}

PresenceManager.prototype.handleOffline = function (clientSessionId, userId, userType, explicit) {
  var message = {
    userId: userId,
    userType: userType,
    clientId: clientSessionId,
    online: false,
    explicit: explicit
  }

  // Only if explicit present and false.
  // When user has an expiry timer running, then don't force remove yet
  // Remove user after 15 seconds when no other clients exist
  if (explicit === false || this.isUserExpiring(userId)) {
    this.store.removeClient(clientSessionId, message)
    this.setupExpiry(userId, userType)
  } else {
    this.store.remove(clientSessionId, userId, message)
  }
}

PresenceManager.prototype.isUserExpiring = function (userId) {
  return !!(this.expiryTimers[userId])
}

PresenceManager.prototype.clearExpiry = function (userId) {
  if (this.expiryTimers[userId]) {
    logging.info('#presence - clear user expiry timeout:', userId, this.scope)
    clearTimeout(this.expiryTimers[userId])
    delete this.expiryTimers[userId]
  }
}
PresenceManager.prototype.setupExpiry = function (userId, userType) {
  this.clearExpiry(userId)

  if (this.store.userExists(userId)) {
    logging.info('#presence - user expiry setup for', userId, this.scope)
    this.expiryTimers[userId] = setTimeout(this.expireUser.bind(this, userId, userType),
      this.policy.userExpirySeconds * 1000)
  }
}

PresenceManager.prototype.expireUser = function (userId, userType) {
  var message = { userId: userId, userType: userType }
  logging.info('#presence - trying to remove user after timeout:', userId, this.scope)
  delete this.expiryTimers[userId]
  this.store.removeUserIfEmpty(userId, message)
}

// For sync
PresenceManager.prototype.fullRead = function (callback) {
  var self = this

  // Sync scope presence
  logging.debug('#presence - fullRead', this.scope)

  this.handleRedisReply = function (replies) {
    logging.debug('#presence - fullRead replies', self.scope, replies)
    if (!replies) {
      if (callback) { callback(self.getOnline()) }
      return
    }

    var count = 0
    var keys = Object.keys(replies)
    var completed = function () {
      count++
      if (count === keys.length) {
        if (callback) callback(self.getOnline())
      }
    }
    // Process all messages in one go before updating subscribers to avoid
    // sending multiple messages
    keys.forEach(function (key) {
      var message = replies[key]
      self.processRedisEntry(message, completed)
    })
  }

  Persistence.readHashAll(this.scope, function (replies) {
    self.handleRedisReply(replies)
  })
}

// Sync v1
PresenceManager.prototype.getOnline = function () {
  var result = {}
  var store = this.store

  this.store.users().forEach(function (userId) {
    result[userId] = store.userTypeOf(userId)
  })

  return result
}

// Sync v2
PresenceManager.prototype.getClientsOnline = function () {
  var result = {}
  var store = this.store

  function processMessage (message) {
    result[message.userId] = result[message.userId] || {
      clients: {},
      userType: message.userType
    }

    var payload = _.extend({},
      (message.userData || {}),
      (message.clientData || {}))

    result[message.userId].clients[message.clientId] = payload
  }

  store.forEachClient(function (uid, cid, message) {
    processMessage(message)
  })

  return result
}

PresenceManager.prototype.hasUser = function (userId) {
  return this.store.userExists(userId)
}

PresenceManager.setBackend = function (backend) {
  Persistence = backend
}

module.exports = PresenceManager
