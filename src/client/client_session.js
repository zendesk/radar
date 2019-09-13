var log = require('minilog')('radar:client')
var EventEmitter = require('events').EventEmitter
var inherits = require('util').inherits
var ClientSessionStateMachine = require('./client_session_state_machine')

// TODO: move to a SessionManager class
var clientsById = {}

function ClientSession (name, id, accountName, version, transport) {
  this.state = ClientSessionStateMachine.create(this)

  this.createdAt = Date.now()
  this.lastModified = Date.now()
  this.name = name
  this.accountName = accountName
  this.id = id
  this.subscriptions = {}
  this.presences = {}
  this.version = version || '0.0.0'
  EventEmitter.call(this)

  this.transport = transport
  this._setupTransport()
  clientsById[this.id] = this
}

inherits(ClientSession, EventEmitter)

ClientSession.prototype._initialize = function (set) {
  var self = this

  if (set) {
    Object.keys(set).forEach(function (key) {
      self[key] = set[key]
    })
  }

  if (this.state.can('initialize')) {
    this.state.initialize()
  }
  this.lastModified = Date.now()
}

ClientSession.prototype._cleanup = function () {
  if (this._cleanupTransport) {
    this._cleanupTransport()
  }

  delete clientsById[this.id]
}

// Instance methods

// ClientSession Message API:
//
// Incoming messages:
// clientSession.on('message', messageHandler)
// Outcoming messages:
// clientSession.send(message)

ClientSession.prototype.send = function (message) {
  var data = JSON.stringify(message)
  log.info('#socket.message.outgoing', this.id, data)
  if (this.state.current === 'ended') {
    log.warn('Cannot send message after ClientSession ended', this.id, data)
    return
  }

  this.transport.send(data)
}

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
  var data = { subscriptions: this.subscriptions, presences: this.presences }

  if (cb) {
    cb(data)
  } else {
    return data
  }
}

// Private methods

ClientSession.prototype._setupTransport = function () {
  var self = this

  if (!this.transport || !this.transport.on) {
    return
  }

  this.transport.on('message', emitClientMessage)
  function emitClientMessage (message) {
    var decoded = self._decodeIncomingMessage(message)
    if (!decoded) {
      log.warn('#socket.message.incoming.decode - could not decode')
      return
    }
    log.info('#socket.message.incoming', self.id, decoded)

    switch (self.state.current) {
      case 'initializing':
      case 'ready':
        self._initializeOnNameSync(decoded)
        self.emit('message', decoded)
        break
    }
  }

  this.transport.once('close', function () {
    log.info('#socket - disconnect', self.id)
    self.state.end()
  })

  this._cleanupTransport = function () {
    self.transport.removeListener('message', emitClientMessage)
    delete self.transport
  }
}

ClientSession.prototype._initializeOnNameSync = function (message) {
  if (message.op !== 'nameSync') { return }

  log.info('#socket.message - nameSync', message, this.id)

  this.send({ op: 'ack', value: message && message.ack })

  var association = message.options.association

  log.info('create: association name: ' + association.name +
    '; association id: ' + association.id)

  // (name, id, accountName, version, transport)

  this._initialize({
    name: association.name,
    accountName: message.accountName,
    clientVersion: message.options.clientVersion
  })
}

ClientSession.prototype._decodeIncomingMessage = function (message) {
  var decoded
  try {
    decoded = JSON.parse(message)
  } catch (e) {
    log.warn('#clientSession.message - json parse error', e)
    return
  }

  // Format check
  if (!decoded || !decoded.op) {
    log.warn('#socket.message - rejected', this.id, decoded)
    return
  }

  return decoded
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

// (String) => ClientSession
function getClientSessionBySocketId (id) {
  return clientsById[id]
}

module.exports = ClientSession
module.exports.get = getClientSessionBySocketId
