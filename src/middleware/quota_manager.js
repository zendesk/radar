const MiniEventEmitter = require('miniee')
const QuotaLimiter = require('./quota_limiter.js')
const ClientSession = require('../client/client_session.js')
const logging = require('minilog')('radar:quota_manager')

const QuotaManager = function () {
  this._limiters = Object.create(null)
}

MiniEventEmitter.mixin(QuotaManager)

QuotaManager.prototype.checkLimits = function (clientSession, message, messageType, next) {
  const limiter = this.getLimiter(messageType)
  let softLimit

  if (!limiter || (message.op !== 'subscribe' && message.op !== 'sync')) {
    next()
  } else if (limiter.isAboveLimit(clientSession.id)) {
    logging.warn('#clientSession.message - rate_limited', message, clientSession.id)

    clientSession.send({
      op: 'err',
      value: 'rate limited',
      origin: message
    })

    next(new Error('limit reached'))
  } else {
    // Log Soft Limit, if available
    softLimit = this._getSoftLimit(messageType)
    if (softLimit && limiter.count(clientSession.id) === softLimit) {
      const client = ClientSession.get(clientSession.id)
      this._logLimits(client, softLimit, limiter.count(clientSession.id))
    }

    next()
  }
}

QuotaManager.prototype.updateLimits = function (clientSession, resource, message, messageType, next) {
  const limiter = this.getLimiter(messageType)

  if (limiter) {
    switch (message.op) {
      case 'sync':
      case 'subscribe':
        limiter.add(clientSession.id, message.to)
        break
      case 'unsubscribe':
        limiter.remove(clientSession.id, message.to)
        break
    }
  }

  next()
}

QuotaManager.prototype.destroyByClient = function (clientSession, resource, messageType, next) {
  const limiter = this.findLimiter(messageType)

  if (limiter) {
    limiter.remove(clientSession.id, resource.to)
  }

  next()
}

QuotaManager.prototype.destroyByResource = function (resource, messageType, next) {
  const to = resource.to
  const limiter = this.findLimiter(messageType)

  if (limiter) {
    limiter.removeByTo(to)
  }

  next()
}

QuotaManager.prototype.findLimiter = function (messageType) {
  return this._limiters[messageType.name]
}

QuotaManager.prototype.getLimiter = function (messageType) {
  let limiter = this.findLimiter(messageType)

  if (!limiter && this._shouldLimit(messageType)) {
    limiter = this._buildLimiter(messageType)
    this._limiters[messageType.name] = limiter
    this.emit('rate_limiter:add', messageType.name, limiter)
  }

  return limiter
}

QuotaManager.prototype._buildLimiter = function (messageType) {
  let limiter

  if (this._shouldLimit(messageType)) {
    limiter = new QuotaLimiter(messageType.policy.limit)
  }

  return limiter
}

QuotaManager.prototype._should = function (type, messageType) {
  return messageType && messageType.policy && messageType.policy[type]
}

QuotaManager.prototype._shouldLimit = function (messageType) {
  return this._should('limit', messageType)
}

QuotaManager.prototype._shouldSoftLimit = function (messageType) {
  return this._should('softLimit', messageType)
}

QuotaManager.prototype._getSoftLimit = function (messageType) {
  let softLimit

  if (this._shouldSoftLimit(messageType)) {
    softLimit = messageType.policy.softLimit
  }

  return softLimit
}

QuotaManager.prototype._logLimits = function (client, expected, actual) {
  if (!client) {
    logging.error('Attempted to log client limits but no client was provided')
    return
  }

  logging.warn('#clientSession.message - rate soft limit reached', client.id, {
    name: client.name,
    actual: actual,
    expected: expected,
    subscriptions: client.subscriptions,
    presences: client.presences
  })
}

/* Middleware api */
QuotaManager.prototype.onMessage = QuotaManager.prototype.checkLimits
QuotaManager.prototype.onResource = QuotaManager.prototype.updateLimits
QuotaManager.prototype.onDestroyResource = QuotaManager.prototype.destroyByResource
QuotaManager.prototype.onDestroyClient = QuotaManager.prototype.destroyByClient

module.exports = QuotaManager
