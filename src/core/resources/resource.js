var MiniEventEmitter = require('miniee')
var logging = require('minilog')('radar:resource')
var Stamper = require('../stamper.js')
var ClientSession = require('../../client/client_session')
/*

Resources
=========

- have a type, one of:

  - have statuses, which are a hash of values. Values never expire by themselves, they are always explicitly set.
  - have messages, which are an ordered set of messages

- can be subscribed to (e.g. pubsub)

- can be synchronized (e.g. read full set of values, possibly applying some filtering), if it is a status or message

*/

function recursiveMerge (target /*, ..sources */) {
  var sources = Array.prototype.slice.call(arguments, 1)

  sources.forEach(function (source) {
    if (source) {
      Object.keys(source).forEach(function (name) {
        // Catch 0s and false too
        if (target[name] !== undefined) {
          // Extend the object if it is an Object
          if (target[name] === Object(target[name])) {
            target[name] = recursiveMerge(target[name], source[name])
          }
        } else {
          target[name] = source[name]
        }
      })
    }
  })

  return target
}

function Resource (to, server, options, default_options) {
  this.to = to
  this.subscribers = {}
  this.server = server // RadarServer instance
  this.options = recursiveMerge({}, options || {}, default_options || {})
}

MiniEventEmitter.mixin(Resource)
Resource.prototype.type = 'default'

// Add a subscriber (ClientSession)
Resource.prototype.subscribe = function (clientSession, message) {
  this.subscribers[clientSession.id] = true

  logging.debug('#' + this.type, '- subscribe', this.to, clientSession.id,
    this.subscribers, message && message.ack)

  this.ack(clientSession, message && message.ack)
}

// Remove a subscriber (ClientSession)
Resource.prototype.unsubscribe = function (clientSession, message) {
  delete this.subscribers[clientSession.id]

  logging.info('#' + this.type, '- unsubscribe', this.to, clientSession.id,
    'subscribers left:', Object.keys(this.subscribers).length)

  if (!Object.keys(this.subscribers).length) {
    logging.info('#' + this.type, '- destroying resource', this.to,
      this.subscribers, clientSession.id)
    this.server.destroyResource(this.to)
  }

  this.ack(clientSession, message && message.ack)
}

// Send to clients
Resource.prototype.redisIn = function (data) {
  var self = this

  Stamper.stamp(data)

  logging.info('#' + this.type, '- incoming from #redis', this.to, data, 'subs:',
    Object.keys(this.subscribers).length)

  Object.keys(this.subscribers).forEach(function (clientSessionId) {
    var clientSession = self.getClientSession(clientSessionId)

    if (clientSession && clientSession.send) {
      data.stamp.clientId = clientSession.id
      clientSession.send(data)
    }
  })

  this.emit('message:outgoing', data)

  if (!Object.keys(this.subscribers).length) {
    logging.info('#' + this.type, '- no subscribers, destroying resource', this.to)
    this.server.destroyResource(this.to)
  }
}

// Return a socket reference; eio server hash is "clients", not "sockets"
Resource.prototype.socketGet = function (id) {
  logging.debug('DEPRECATED: use clientSessionGet instead')
  return this.getClientSession(id)
}

Resource.prototype.getClientSession = function (id) {
  return ClientSession.get(id)
}

Resource.prototype.ack = function (clientSession, sendAck) {
  if (clientSession && clientSession.send && sendAck) {
    logging.debug('#clientSession - send_ack', clientSession.id, this.to, sendAck)

    clientSession.send({
      op: 'ack',
      value: sendAck
    })
  }
}

Resource.prototype.handleMessage = function (clientSession, message) {
  switch (message.op) {
    case 'subscribe':
    case 'unsubscribe':
    case 'get':
    case 'sync':
    case 'set':
    case 'publish':
    case 'push':
      this[message.op](clientSession, message)
      this.emit('message:incoming', message)
      break
    default:
      logging.error('#resource - Unknown message.op, ignoring', message, clientSession && clientSession.id)
  }
}

Resource.prototype.destroy = function () {
  this.destroyed = true
}

Resource.setBackend = function (backend) {
  // noop
}

module.exports = Resource
