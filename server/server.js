var _ = require('underscore')
var async = require('async')
var MiniEventEmitter = require('miniee')
var Core = require('../core')
var Type = Core.Type
var logging = require('minilog')('radar:server')
var hostname = require('os').hostname()
var DefaultEngineIO = require('engine.io')
var Semver = require('semver')
var ClientSession = require('../client/client_session.js')
var Middleware = require('../middleware')
var Stamper = require('../core/stamper.js')
var ServiceInterface = require('./service_interface')

function Server () {
  this.socketServer = null
  this.resources = {}
  this.subscriber = null
  this.subs = {}
  this.sentry = Core.Resources.Presence.sentry
}

MiniEventEmitter.mixin(Server)
Middleware.Runner.mixin(Server)

// Public API

// Attach to a http server
Server.prototype.attach = function (httpServer, configuration) {
  var finishSetup = this._setup.bind(this, httpServer, configuration)
  this._setupPersistence(configuration, finishSetup)
}

// Destroy empty resource
Server.prototype.destroyResource = function (to) {
  var self = this
  var messageType = this._getMessageType(to)
  var resource = this.resources[to]

  if (resource) {
    this.runMiddleware('onDestroyResource', resource, messageType, function lastly (err) {
      if (err) { throw err }

      resource.destroy()
      self.emit('resource:destroy', resource)
      delete self.resources[to]
      delete self.subs[to]

      if (self.subscriber) {
        logging.info('#redis - unsubscribe', to)
        self.subscriber.unsubscribe(to)
      }
    })
  }
}

Server.prototype.terminate = function (done) {
  var self = this

  Object.keys(this.resources).forEach(function (to) {
    self.destroyResource(to)
  })

  this.sentry.stop()

  if (this.socketServer) {
    this.socketServer.close()
  }

  Core.Persistence.disconnect(done)
}

// Private API

var VERSION_CLIENT_STOREDATA = '0.13.1'

Server.prototype._setup = function (httpServer, configuration) {
  configuration = configuration || {}

  this._setupSentry(configuration)
  this._setupEngineio(httpServer, configuration.engineio)
  this._setupDistributor()
  this._setupServiceInterface(httpServer)

  logging.debug('#server - start ' + new Date().toString())
  this.emit('ready')
}

Server.prototype._setupServiceInterface = function (httpServer) {
  var self = this
  var service = ServiceInterface.setup(httpServer, self)
  this._serviceInterface = service

  service.on('request', function (clientSession, message) {
    self._processMessage(clientSession, message)
  })
}

Server.prototype._setupEngineio = function (httpServer, engineioConfig) {
  var engine = DefaultEngineIO
  var engineConf

  if (engineioConfig) {
    engine = engineioConfig.module
    engineConf = engineioConfig.conf

    this.engineioPath = engineioConfig.conf ? engineioConfig.conf.path : 'default'
  }

  this.socketServer = engine.attach(httpServer, engineConf)
  this.socketServer.on('connection', this._onSocketConnection.bind(this))
}

Server.prototype._onSocketConnection = function (socket) {
  var self = this

  // Event: socket connected
  logging.info('#socket - connect', socket.id)

  var clientSession = ClientSession.createFromSocket(socket)

  clientSession.on('message', function (data) {
    self._processMessage(clientSession, data)
  })

  clientSession.on('end', function () {
    Object.keys(self.resources).forEach(function (scope) {
      var resource = self.resources[scope]

      // TODO: rename middleware event to make clear that this is per client*resource pair
      self.runMiddleware('onDestroyClient', socket, resource, resource.options, function lastly (err) {
        if (err) { throw err }
        if (resource.subscribers[socket.id]) {
          resource.unsubscribe(socket, false)
        }
      })
    })
  })
}

Server.prototype._setupDistributor = function () {
  this.subscriber = Core.Persistence.pubsub()

  this.subscriber.on('message', this._handlePubSubMessage.bind(this))

  var oldPublish = Core.Persistence.publish

  // Log all outgoing to redis server
  Core.Persistence.publish = function (channel, data, callback) {
    logging.info('#redis.message.outgoing', channel, data)
    oldPublish(channel, data, callback)
  }
}

Server.prototype._setupSentry = function (configuration) {
  var sentryOptions = {
    host: hostname,
    port: configuration.port
  }

  if (configuration.sentry) {
    _.extend(sentryOptions, configuration.sentry)
  }

  Stamper.setup(this.sentry.name)

  this.sentry.start(sentryOptions)
}

// Process a message from persistence (i.e. subscriber)
Server.prototype._handlePubSubMessage = function (to, data) {
  if (this.resources[to]) {
    try {
      data = JSON.parse(data)
    } catch (parseError) {
      logging.error('#redis - Corrupted key value [' + to + ']. ' + parseError.message + ': ' + parseError.stack)
      return
    }

    logging.info('#redis.message.incoming', to, data)
    this.resources[to].redisIn(data)
  } else {
    // Don't log sentry channel pub messages
    if (to === Core.Presence.Sentry.channel) {
      return
    }

    logging.warn('#redis - message not handled', to, data)
  }
}

Server.prototype._processMessage = function (clientSession, message) {
  var self = this

  // recursively handle `BatchMessage`s
  if (message.op === 'batch') {
    async.each(message.value, function (submessage, callback) {
      self._processMessage(clientSession, submessage)
      callback()
    })
    return
  }

  var messageType = this._getMessageType(message.to)

  if (!messageType) {
    logging.warn('#socket.message - unknown type', message, clientSession.id)
    this._sendErrorMessage(clientSession, 'unknown_type', message)
    return
  }

  this.runMiddleware('onMessage', clientSession, message, messageType, function lastly (err) {
    if (err) {
      logging.warn('#socket.message - pre filter halted execution', message)
      return
    }
    if (message.op !== 'nameSync') {
      self._handleResourceMessage(clientSession, message, messageType)
    }
  })
}

// Initialize a client, and persist messages where required
Server.prototype._persistClientData = function (socket, message) {
  var clientSession = ClientSession.get(socket.id)
  if (clientSession && Semver.gte(clientSession.version, VERSION_CLIENT_STOREDATA)) {
    logging.info('#socket.message - _persistClientData', message, socket.id)
    clientSession.storeData(message)
  }
}

// Get a resource, subscribe where required, and handle associated message
Server.prototype._handleResourceMessage = function (socket, message, messageType) {
  var self = this
  var to = message.to
  var resource = this._getResource(message, messageType)

  if (resource) {
    logging.info('#socket.message - received', socket.id, message,
      (this.resources[to] ? 'exists' : 'not instantiated'),
      (this.subs[to] ? 'is subscribed' : 'not subscribed')
    )

    this.runMiddleware('onResource', socket, resource, message, messageType, function (err) {
      if (err) {
        logging.warn('#socket.message - post filter halted execution', message)
        return
      }

      self._persistClientData(socket, message)
      self._storeResource(resource)
      self._persistenceSubscribe(resource.to, socket.id)
      self._stampMessage(socket, message)
      resource.handleMessage(socket, message)
      self.emit(message.op, socket, message)
    })
  }
}

Server.prototype._getMessageType = function (messageScope) {
  return Type.getByExpression(messageScope)
}

// Get or create resource by "to" (aka, full scope)
Server.prototype._getResource = function (message, messageType) {
  var to = message.to
  var type = messageType.type
  var resource = this.resources[to]

  if (!resource) {
    if (type && Core.Resources[type]) {
      resource = new Core.Resources[type](to, this, messageType)
    } else {
      logging.error('#resource - unknown_type', to, messageType)
    }
  }
  return resource
}

Server.prototype._storeResource = function (resource) {
  if (!this.resources[resource.to]) {
    this.resources[resource.to] = resource
    this.emit('resource:new', resource)
  }
}

// Subscribe to the persistence pubsub channel for a single resource
Server.prototype._persistenceSubscribe = function (to, id) {
  if (!this.subs[to]) {
    logging.debug('#redis - subscribe', to, id)

    this.subscriber.subscribe(to, function (err) {
      if (err) {
        logging.error('#redis - subscribe failed', to, id, err)
      } else {
        logging.debug('#redis - subscribe successful', to, id)
      }
    })
    this.subs[to] = true
  }
}

// Transforms Redis URL into persistence configuration object
Server.prototype._setupPersistence = function (configuration, done) {
  Core.Persistence.setConfig(configuration.persistence)
  Core.Persistence.connect(done)
}

Server.prototype._sendErrorMessage = function (socket, value, origin) {
  socket.send({
    op: 'err',
    value: value,
    origin: origin
  })
}

Server.prototype._stampMessage = function (socket, message) {
  return Stamper.stamp(message, socket.id)
}

module.exports = Server
