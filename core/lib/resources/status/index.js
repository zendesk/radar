var Resource = require('../resource.js'),
  Persistence = require('persistence'),
  logger = require('minilog')('radar:status')

var default_options = {
  policy: {
    maxPersistence: 12 * 60 * 60 // 12 hours in seconds
  }
}

function Status (to, server, options) {
  Resource.call(this, to, server, options, default_options)
}

Status.prototype = new Resource()
Status.prototype.type = 'status'

// Get status
Status.prototype.get = function (socket) {
  var to = this.to

  logger.debug('#status - get', this.to, (socket && socket.id))

  this._get(to, function (replies) {
    socket.send({
      op: 'get',
      to: to,
      value: replies || {}
    })
  })
}

Status.prototype._get = function (to, callback) {
  Persistence.readHashAll(to, callback)
}

Status.prototype.set = function (socket, message) {
  var self = this

  logger.debug('#status - set', this.to, message, (socket && socket.id))

  Status.prototype._set(this.to, message, this.options.policy, function () {
    self.ack(socket, message.ack)
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

Status.prototype.sync = function (socket) {
  logger.debug('#status - sync', this.to, (socket && socket.id))

  this.subscribe(socket, false)
  this.get(socket)
}

Status.setBackend = function (backend) {
  Persistence = backend
}

module.exports = Status
