var Resource = require('../resource.js')
var Persistence = require('persistence')
var logger = require('minilog')('radar:message_list')

var defaultOptions = {
  policy: {
    maxPersistence: 14 * 24 * 60 * 60 // 2 weeks in seconds
  }
}

// Every time we use this channel, we prolong expiry to maxPersistence
// This includes even the final unsubscribe, in case a client decides to rejoin
// after being the last user.

function MessageList (to, server, options) {
  Resource.call(this, to, server, options, defaultOptions)
}

MessageList.prototype = new Resource()
MessageList.prototype.type = 'message'

// Publish to Redis
MessageList.prototype.publish = function (clientSession, message) {
  var self = this

  logger.debug('#message_list - publish', this.to, message, clientSession && clientSession.id)

  this._publish(this.to, this.options.policy, message, function () {
    self.ack(clientSession, message.ack)
  })
}

MessageList.prototype._publish = function (to, policy, message, callback) {
  if (policy && policy.cache) {
    Persistence.persistOrdered(to, message)
    if (policy.maxPersistence) {
      Persistence.expire(to, policy.maxPersistence)
    }
  }
  Persistence.publish(to, message, callback)
}

MessageList.prototype.sync = function (clientSession, message) {
  var to = this.to

  logger.debug('#message_list - sync', this.to, message, clientSession && clientSession.id)

  this._sync(to, this.options.policy, function (replies) {
    clientSession.send({
      op: 'sync',
      to: to,
      value: replies,
      time: Date.now()
    })
  })

  this.subscribe(clientSession, message)
}

MessageList.prototype._sync = function (to, policy, callback) {
  if (policy && policy.maxPersistence) {
    Persistence.expire(to, policy.maxPersistence)
  }

  Persistence.readOrderedWithScores(to, policy, callback)
}

MessageList.prototype.unsubscribe = function (clientSession, message) {
  Resource.prototype.unsubscribe.call(this, clientSession, message)
  // Note that since this is not synchronized across multiple backend servers,
  // it is possible for a channel that is subscribed elsewhere to have a TTL set
  // on it again. The assumption is that the TTL is so long that any normal
  // workflow will terminate before it is triggered.
  if (this.options && this.options.policy &&
    this.options.policy.cache &&
    this.options.policy.maxPersistence) {
    Persistence.expire(this.to, this.options.policy.maxPersistence)
  }
}

MessageList.setBackend = function (backend) {
  Persistence = backend
}

module.exports = MessageList
