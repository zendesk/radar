const Resource = require('../resource.js')
let Persistence = require('persistence')
const logger = require('minilog')('radar:status')

const defaultOptions = {
  policy: {
    maxPersistence: 12 * 60 * 60 // 12 hours in seconds
  }
}

function Status (to, server, options) {
  Resource.call(this, to, server, options, defaultOptions)
}

Status.prototype = new Resource()
Status.prototype.type = 'status'

// Get status
Status.prototype.get = function (clientSession) {
  const to = this.to

  logger.debug('#status - get', this.to, (clientSession && clientSession.id))

  this._get(to, function (replies) {
    clientSession.send({
      op: 'get',
      to: to,
      value: replies || {}
    })
  })
}

Status.prototype._get = function (to, callback) {
  Persistence.readHashAll(to, callback)
}

Status.prototype.set = function (clientSession, message) {
  const self = this

  logger.debug('#status - set', this.to, message, (clientSession && clientSession.id))

  Status.prototype._set(this.to, message, this.options.policy, function () {
    self.ack(clientSession, message.ack)
  })
}

Status.prototype._set = function (scope, message, policy, callback) {
  Persistence.persistHash(scope, message.key, message.value)

  if (policy && policy.maxPersistence) {
    Persistence.expire(scope, policy.maxPersistence)
  } else {
    logger.warn('resource created without ttl :', scope)
    logger.warn('resource policy was :', policy)
  }

  Persistence.publish(scope, message, callback)
}

Status.prototype.sync = function (clientSession) {
  logger.debug('#status - sync', this.to, (clientSession && clientSession.id))

  this.subscribe(clientSession, false)
  this.get(clientSession)
}

Status.setBackend = function (backend) {
  Persistence = backend
}

module.exports = Status
