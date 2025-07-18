const Resource = require('../resource.js')
const PresenceManager = require('./presence_manager.js')
const Stamper = require('../../stamper.js')
const logging = require('minilog')('radar:presence')

const defaultOptions = {
  policy: {
    // 12 hours in seconds
    maxPersistence: 12 * 60 * 60,

    // Buffer time for a user to timeout after client disconnects (implicit)
    userExpirySeconds: 15
  }
}

function Presence (to, server, options) {
  this.sentry = server.sentry
  Resource.call(this, to, server, options, defaultOptions)
  this.setup()
}

Presence.prototype = new Resource()
Presence.prototype.type = 'presence'

Presence.prototype.setup = function () {
  const self = this

  this.manager = new PresenceManager(this.to, this.options.policy, this.sentry)

  this.manager.on('user_online', function (userId, userType, userData) {
    logging.info('#presence - user_online', userId, userType, self.to)
    const value = Object.create(null)
    value[userId] = userType
    self.broadcast({
      to: self.to,
      op: 'online',
      value: value,
      userData: userData
    })
  })

  this.manager.on('user_offline', function (userId, userType) {
    logging.info('#presence - user_offline', userId, userType, self.to)
    const value = Object.create(null)
    value[userId] = userType
    self.broadcast({
      to: self.to,
      op: 'offline',
      value: value
    })
  })

  this.manager.on('client_online', function (clientSessionId, userId, userType, userData, clientData) {
    logging.info('#presence - client_online', clientSessionId, userId, self.to, userData, clientData)
    self.broadcast({
      to: self.to,
      op: 'client_online',
      value: {
        userId: userId,
        clientId: clientSessionId,
        userData: userData,
        clientData: clientData
      }
    })
  })

  this.manager.on('client_updated', function (clientSessionId, userId, userType, userData, clientData) {
    logging.info('#presence - client_updated', clientSessionId, userId, self.to, userData, clientData)
    self.broadcast({
      to: self.to,
      op: 'client_updated',
      value: {
        userId: userId,
        clientId: clientSessionId,
        userData: userData,
        clientData: clientData
      }
    })
  })

  this.manager.on('client_offline', function (clientSessionId, userId, explicit) {
    logging.info('#presence - client_offline', clientSessionId, userId, explicit, self.to)
    self.broadcast({
      to: self.to,
      op: 'client_offline',
      explicit: !!explicit,
      value: {
        userId: userId,
        clientId: clientSessionId
      }
    }, clientSessionId)
  })
}

Presence.prototype.redisIn = function (message) {
  logging.info('#presence - incoming from #redis', this.to, message, 'subs:',
    Object.keys(this.subscribers).length)
  this.manager.processRedisEntry(message)
}

Presence.prototype.set = function (clientSession, message) {
  if (message.value !== 'offline') {
    this._setOnline(clientSession, message)
  } else {
    this._setOffline(clientSession, message)
  }
}

Presence.prototype._setOnline = function (clientSession, message) {
  const presence = this
  const userId = message.key

  function ackCheck () {
    presence.ack(clientSession, message.ack)
  }
  this.manager.addClient(clientSession.id, userId,
    message.type,
    message.userData,
    message.clientData,
    ackCheck)

  if (!this.subscribers[clientSession.id]) {
    // We use subscribe/unsubscribe to trap the "close" event, so subscribe now
    this.subscribe(clientSession)

    // We are subscribed, but not listening
    this.subscribers[clientSession.id] = { listening: false }
  }
}

Presence.prototype._setOffline = function (clientSession, message) {
  const presence = this
  const userId = message.key

  function ackCheck () {
    presence.ack(clientSession, message.ack)
  }

  // If this is client is not subscribed
  if (!this.subscribers[clientSession.id]) {
    // This is possible if a client does .set('offline') without
    // set-online/sync/subscribe
    Resource.prototype.unsubscribe.call(this, clientSession, message)
  } else {
    // Remove from local
    this.manager.removeClient(clientSession.id, userId, message.type, ackCheck)
  }
}

Presence.prototype.subscribe = function (clientSession, message) {
  Resource.prototype.subscribe.call(this, clientSession, message)
  this.subscribers[clientSession.id] = { listening: true }
}

Presence.prototype.unsubscribe = function (clientSession, message) {
  logging.info('#presence - implicit disconnect', clientSession.id, this.to)
  this.manager.disconnectClient(clientSession.id)

  Resource.prototype.unsubscribe.call(this, clientSession, message)
}

Presence.prototype.sync = function (clientSession, message) {
  const self = this
  this.fullRead(function (online) {
    if (message.options && parseInt(message.options.version, 10) === 2) {
      const value = self.manager.getClientsOnline()
      logging.info('#presence - sync', value)
      clientSession.send({
        op: 'get',
        to: self.to,
        value: value
      })
    } else {
      logging.warn('presence v1 received, sending online', self.to, clientSession.id)

      // Will deprecate when syncs no longer need to use "online" to look like
      // regular messages
      clientSession.send({
        op: 'online',
        to: self.to,
        value: online
      })
    }
  })
  this.subscribe(clientSession, message)
}

// This is a full sync of the online status from Redis
Presence.prototype.get = function (clientSession, message) {
  const self = this
  this.fullRead(function (online) {
    let value

    if (message.options && message.options.version === 2) {
      // pob
      value = self.manager.getClientsOnline()
      logging.info('#presence - get', value)
    } else {
      value = online
    }

    clientSession.send({
      op: 'get',
      to: self.to,
      value: value
    })
  })
}

Presence.prototype.broadcast = function (message, except) {
  const self = this

  Stamper.stamp(message)

  this.emit('message:outgoing', message)

  logging.debug('#presence - update subscribed clients', message, except, this.to)

  Object.keys(this.subscribers).forEach(function (clientSessionId) {
    const clientSession = self.getClientSession(clientSessionId)
    if (clientSession && clientSessionId !== except && self.subscribers[clientSessionId].listening) {
      message.stamp.clientId = clientSessionId
      clientSession.send(message)
    } else {
      logging.warn('#clientSession - not sending: ', clientSessionId, message, except,
        'explicit:', self.subscribers[clientSessionId], self.to)
    }
  })
}

Presence.prototype.fullRead = function (callback) {
  this.manager.fullRead(callback)
}

Presence.prototype.destroy = function () {
  this.manager.destroy()
  Resource.prototype.destroy.call(this)
}

Presence.setBackend = function (backend) {
  PresenceManager.setBackend(backend)
}

module.exports = Presence
