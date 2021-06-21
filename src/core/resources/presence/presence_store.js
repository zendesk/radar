const _ = require('lodash')
const logging = require('minilog')('radar:presence_store')

function PresenceStore (scope) {
  this.scope = scope
  this.map = {}
  this.cache = {}
  this.socketUserMap = {}
  this.userTypes = {}
}

require('util').inherits(PresenceStore, require('events').EventEmitter)

// Cache the client data without adding
PresenceStore.prototype.cacheAdd = function (clientSessionId, message) {
  this.cache[clientSessionId] = message
}

PresenceStore.prototype.cacheRemove = function (clientSessionId) {
  const val = this.cache[clientSessionId]
  delete this.cache[clientSessionId]
  return val
}

PresenceStore.prototype.add = function (clientSessionId, userId, userType, message) {
  const self = this
  const events = []

  logging.debug('#presence - store.add', userId, clientSessionId, message, this.scope)
  this.cacheRemove(clientSessionId)

  if (!this.map[userId]) {
    events.push('user_added')
    this.map[userId] = {}
    this.userTypes[userId] = userType
  }

  if (!this.map[userId][clientSessionId]) {
    events.push('client_added')
    this.map[userId][clientSessionId] = message
    this.socketUserMap[clientSessionId] = userId
  } else {
    const previous = this.map[userId][clientSessionId]
    if (message.clientData && !_.isEqual(message.clientData, previous.clientData)) {
      events.push('client_updated')
      this.map[userId][clientSessionId] = message
    }
  }

  events.forEach(function (event) {
    logging.debug('#presence - store.emit', event, message, self.scope)

    self.emit(event, message)
  })
}

PresenceStore.prototype.remove = function (clientSessionId, userId, message) {
  const self = this
  const events = []

  logging.debug('#presence - store.remove', userId, clientSessionId, message, this.scope)

  this.cacheRemove(clientSessionId)

  // When non-existent, return
  if (!this.map[userId] || !this.map[userId][clientSessionId]) {
    return
  }

  events.push('client_removed')
  delete this.map[userId][clientSessionId]
  delete this.socketUserMap[clientSessionId]

  // Empty user
  if (Object.keys(this.map[userId]).length === 0) {
    events.push('user_removed')
    delete this.map[userId]
    delete this.userTypes[userId]
  }

  events.forEach(function (ev) {
    logging.debug('#presence - store.emit', ev, message, self.scope)
    self.emit(ev, message)
  })
}

PresenceStore.prototype.removeClient = function (clientSessionId, message) {
  const userId = this.socketUserMap[clientSessionId]
  this.cacheRemove(clientSessionId)

  // When non-existent, return
  if (!userId) {
    logging.warn('#presence - store.removeClient: cannot find data for',
      clientSessionId, this.scope)
    return
  }

  logging.debug('#presence - store.removeClient', userId, clientSessionId, message, this.scope)
  delete this.map[userId][clientSessionId]
  delete this.socketUserMap[clientSessionId]

  logging.debug('#presence - store.emit', 'client_removed', message, this.scope)
  this.emit('client_removed', message)
}

PresenceStore.prototype.removeUserIfEmpty = function (userId, message) {
  if (this.userExists(userId) && this.userEmpty(userId)) {
    logging.debug('#presence - store.removeUserIfEmpty', userId, message, this.scope)
    delete this.map[userId]
    delete this.userTypes[userId]
    logging.debug('#presence - store.emit', 'user_removed', message, this.scope)
    this.emit('user_removed', message)
  }
}

PresenceStore.prototype.userOf = function (clientSessionId) {
  return this.socketUserMap[clientSessionId]
}

PresenceStore.prototype.get = function (clientSessionId, userId) {
  return (this.map[userId] && this.map[userId][clientSessionId])
}

PresenceStore.prototype.users = function () {
  return Object.keys(this.map)
}

PresenceStore.prototype.sockets = function (userId) {
  return ((this.map[userId] && Object.keys(this.map[userId])) || [])
}

PresenceStore.prototype.forEachClient = function (callback) {
  const store = this
  this.users().forEach(function (userId) {
    store.sockets(userId).forEach(function (clientSessionId) {
      if (callback) callback(userId, clientSessionId, store.get(clientSessionId, userId))
    })
  })
}

PresenceStore.prototype.userEmpty = function (userId) {
  return !!(this.map[userId] && Object.keys(this.map[userId]).length === 0)
}

PresenceStore.prototype.userTypeOf = function (userId) {
  return this.userTypes[userId]
}

PresenceStore.prototype.userExists = function (userId) {
  return !!this.map[userId]
}

// This returns a list of clientSessionIds, which is not costly.  The code that calls
// this code uses each clientSessionId in a separate chained call, the sum of which is
// costly.
PresenceStore.prototype.clientSessionIdsForSentryId = function (sentryId) {
  const map = this.map
  const clientSessionIds = []
  Object.keys(map).forEach(function (userId) {
    Object.keys(map[userId]).forEach(function (clientSessionId) {
      const data = map[userId][clientSessionId]
      if (data && data.sentry === sentryId) {
        clientSessionIds.push(clientSessionId)
      }
    })
  })

  return clientSessionIds
}

module.exports = PresenceStore
