var log = require('minilog')('radar:client')

function ClientSession (name, id, accountName, version) {
  this.createdAt = Date.now()
  this.lastModified = Date.now()
  this.name = name
  this.id = id
  this.subscriptions = {}
  this.presences = {}
  this.version = version
}

// Class properties
ClientSession.clients = {} // keyed by name
ClientSession.names = {} // keyed by id

require('util').inherits(ClientSession, require('events').EventEmitter)

// Public API

// Class methods

// Get current client associated with a given socket id
ClientSession.get = function (id) {
  var name = ClientSession.names[id]
  if (name) {
    return ClientSession.clients[name]
  }
}

// Set up client name/id association, and return new client instance
ClientSession.create = function (message) {
  var association = message.options.association
  ClientSession.names[association.id] = association.name
  var clientSession = new ClientSession(association.name, association.id,
    message.accountName, message.options.clientVersion)

  ClientSession.clients[association.name] = clientSession

  log.info('create: association name: ' + association.name +
    '; association id: ' + association.id)

  return clientSession
}

// Instance methods

// Persist subscriptions and presences when not already persisted in memory
ClientSession.prototype.storeData = function (messageIn) {
  var processedOp = false

  // Persist the message data, according to type
  switch (messageIn.op) {
    case 'unsubscribe':
    case 'sync':
    case 'subscribe':
      processedOp = this._storeDataSubscriptions(messageIn)
      break

    case 'set':
      processedOp = this._storeDataPresences(messageIn)
      break
  }

  // FIXME: For now log everything Later, enable sample logging
  if (processedOp) {
    this._logState()
  }

  return true
}

ClientSession.prototype.readData = function (cb) {
  var data = {subscriptions: this.subscriptions, presences: this.presences}

  if (cb) {
    cb(data)
  } else {
    return data
  }
}

ClientSession.prototype._logState = function () {
  var subCount = Object.keys(this.subscriptions).length
  var presCount = Object.keys(this.presences).length

  log.info('#storeData', {
    client_id: this.id,
    subscription_count: subCount,
    presence_count: presCount
  })
}

ClientSession.prototype._storeDataSubscriptions = function (messageIn) {
  var message = _cloneForStorage(messageIn)
  var to = message.to
  var existingSubscription

  // Persist the message data, according to type
  switch (message.op) {
    case 'unsubscribe':
      if (this.subscriptions[to]) {
        delete this.subscriptions[to]
        return true
      }
      break

    case 'sync':
    case 'subscribe':
      existingSubscription = this.subscriptions[to]
      if (!existingSubscription || (existingSubscription.op !== 'sync' && message.op === 'sync')) {
        this.subscriptions[to] = message
        return true
      }
  }

  return false
}

ClientSession.prototype._storeDataPresences = function (messageIn) {
  var message = _cloneForStorage(messageIn)
  var to = message.to
  var existingPresence

  // Persist the message data, according to type
  if (message.op === 'set' && to.substr(0, 'presence:/'.length) === 'presence:/') {
    existingPresence = this.presences[to]

    // Should go offline
    if (existingPresence && messageIn.value === 'offline') {
      delete this.presences[to]
      return true
    } else if (!existingPresence && message.value !== 'offline') {
      this.presences[to] = message
      return true
    }
  }

  return false
}

// Private functions
// TODO: move to util module
function _cloneForStorage (messageIn) {
  var message = {}

  message.to = messageIn.to
  message.op = messageIn.op

  return message
}

module.exports = ClientSession
