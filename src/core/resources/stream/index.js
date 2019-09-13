var Resource = require('../resource.js')
var Persistence = require('persistence')
var logging = require('minilog')('radar:stream')
var SubscriberState = require('./subscriber_state.js')

var defaultOptions = {
  policy: {
    maxPersistence: 7 * 24 * 60 * 60, // 1 week in seconds
    maxLength: 100000
  }
}

function Stream (to, server, options) {
  Resource.call(this, to, server, options, defaultOptions)
  this.list = new Persistence.List(to, this.options.policy.maxPersistence, this.options.policy.maxLength)
  this.subscriberState = new SubscriberState()
}

Stream.prototype = new Resource()
Stream.prototype.type = 'stream'

Stream.prototype._getSyncError = function (from) {
  return {
    to: this.to,
    error: {
      type: 'sync-error',
      from: from,
      start: this.start,
      end: this.end,
      size: this.size
    }
  }
}

Stream.prototype._subscribe = function (clientSession, message) {
  var self = this
  var from = message.options && message.options.from
  var sub = this.subscriberState.get(clientSession.id)

  if (typeof from === 'undefined' || from < 0) {
    return
  }

  sub.startSubscribing(from)
  this._get(from, function (error, values) {
    if (error) {
      var syncError = self._getSyncError(from)
      syncError.op = 'push'
      clientSession.send(syncError)
    } else {
      values.forEach(function (message) {
        message.op = 'push'
        message.to = self.to
        clientSession.send(message)
        sub.sent = message.id
      })
    }
    sub.finishSubscribing()
  })
}

Stream.prototype.subscribe = function (clientSession, message) {
  Resource.prototype.subscribe.call(this, clientSession, message)
  this._subscribe(clientSession, message)
}

Stream.prototype.get = function (clientSession, message) {
  var stream = this
  var from = message && message.options && message.options.from
  logging.debug('#stream - get', this.to, 'from: ' + from, (clientSession && clientSession.id))

  this._get(from, function (error, values) {
    if (error) {
      var syncError = stream._getSyncError(from)
      syncError.op = 'get'
      syncError.value = []
      clientSession.send(syncError)
    } else {
      clientSession.send({
        op: 'get',
        to: stream.to,
        value: values || []
      })
    }
  })
}

Stream.prototype._get = function (from, callback) {
  var self = this
  this.list.info(function (error, start, end, size) {
    if (error) { return callback(error) }
    self.start = start
    self.end = end
    self.size = size
    self.list.read(from, start, end, size, callback)
  })
}

Stream.prototype.push = function (clientSession, message) {
  var self = this

  logging.debug('#stream - push', this.to, message, (clientSession && clientSession.id))

  var m = {
    to: this.to,
    op: 'push',
    resource: message.resource,
    action: message.action,
    value: message.value,
    userData: message.userData
  }

  this.list.push(m, function (error, stamped) {
    if (error) {
      console.log(error)
      logging.error(error)
      return
    }

    logging.debug('#stream - push complete with id', self.to, stamped, (clientSession && clientSession.id))
    self.ack(clientSession, message.ack)
  })
}

Stream.prototype.sync = function (clientSession, message) {
  logging.debug('#stream - sync', this.to, (clientSession && clientSession.id))
  this.get(clientSession, message)
  this.subscribe(clientSession, false)
}

Stream.prototype.redisIn = function (data) {
  var self = this
  logging.info('#' + this.type, '- incoming from #redis', this.to, data, 'subs:', Object.keys(this.subscribers).length)
  Object.keys(this.subscribers).forEach(function (clientSessionId) {
    var clientSession = self.getClientSession(clientSessionId)
    if (clientSession && clientSession.send) {
      var sub = self.subscriberState.get(clientSession.id)
      if (sub && sub.sendable(data)) {
        clientSession.send(data)
        sub.sent = data.id
      }
    }
  })

  // Someone released the lock, wake up
  this.list.unblock()
}

Stream.setBackend = function (backend) { Persistence = backend }

module.exports = Stream
