var _ = require('lodash')
var async = require('async')
var MiniEventEmitter = require('miniee')
var Redis = require('persistence')
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
var SessionManager = require('./session_manager')
var SocketClientSessionAdapter = require('../client/socket_client_session_adapter')
var Promise = require('polyfill-promise')
var id = require('../core/id')
var Sentry = require('../core/resources/presence/sentry')
var nonblocking = require('nonblocking')

function Server () {
  var self = this
  this.id = id()
  this.sessionManager = new SessionManager({
    adapters: [new SocketClientSessionAdapter(ClientSession)]
  })
  this.socketServer = null
  this.resources = {}
  this.subscriber = null
  this.subs = {}
  this.sentry = null

  this.ready = new Promise(function (resolve) {
    self._ready = resolve
  })
}

MiniEventEmitter.mixin(Server)
Middleware.Runner.mixin(Server)

// Public API

// Attach to a http server
Server.prototype.attach = function (httpServer, configuration) {
  this._setup(httpServer, configuration)
  return this.ready
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

// (HttpServer, configuration: Object) => Promise
Server.prototype._setup = function (httpServer, configuration) {
  configuration = configuration || {}
  var self = this

  return self._setupRedis(configuration.persistence)
  .then(function () {
    self._setupSentry(configuration)
    Stamper.setup(self.sentry.name)
    self._setupEngineio(httpServer, configuration.engineio)
    self._setupDistributor()
    self._setupServiceInterface(httpServer)
  })
  .then(function () {
    logging.debug('#server - started ' + self.id)
    self.emit('ready')
    self._ready()
  }, function (err) {
    logging.error('#server - could not start', err)
  })
}

Server.prototype._setupRedis = function (configuration) {
  return new Promise(function (resolve) {
    Redis.setConfig(configuration)
    Redis.connect(resolve)
  })
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

Server.prototype._setupDistributor = function () {
  this.subscriber = Redis.pubsub()

  this.subscriber.on('message', this._handlePubSubMessage.bind(this))

  var oldPublish = Redis.publish

  // Log all outgoing to redis server
  Redis.publish = function (channel, data, callback) {
    logging.info('#redis.message.outgoing', channel, data)
    oldPublish(channel, data, callback)
  }

  this.publish = Redis.publish
}

Server.prototype._setupSentry = function (configuration) {
  var self = this
  var sentryOptions = {
    host: hostname,
    port: configuration.port
  }

  if (configuration.sentry) {
    _.extend(sentryOptions, configuration.sentry)
  }

  this.sentry = new Sentry(this.id)
  this.sentry.start(sentryOptions)

  this.sentry.on('up', function (sentryId, message) {
    self.emit('sentry:up', sentryId, message)
  })

  this.sentry.on('down', function (sentryId, message) {
    self.emit('sentry:down', sentryId, message)
    self._onSentryDown(sentryId)
  })
}

Server.prototype._onSentryDown = function (sentryId) {
  var resources = this.resources
  var presences = []

  Object.keys(resources).forEach(function (scope) {
    if (resources[scope].type === 'presence') {
      presences.push(resources[scope])
    }
  })

  var expected = 0
  var disconnects = 0
  var started = Date.now()

  nonblocking(presences).forEach(function (presence) {
    if (presence.destroyed) {
      return
    }

    var clientSessionIds = presence.manager.store.clientSessionIdsForSentryId(sentryId)
    expected += clientSessionIds.length

    nonblocking(clientSessionIds).forEach(function (clientSessionId) {
      disconnects += 1
      logging.info('#presence - #sentry down, removing socket:', sentryId, presence.to, clientSessionId)
      presence.manager.disconnectRemoteClient(clientSessionId)
    }, function () {
      if (expected === disconnects) {
        end()
      }
    })
  })

  var self = this
  function end () {
    var duration = Date.now() - started
    self.emit('profiling', {
      name: '_onSentryDown',
      duration: duration,
      data: {
        sentryId: sentryId,
        sessionCount: disconnects
      }
    })
  }
}

Server.prototype._onSocketConnection = function (socket) {
  var self = this

  // Event: socket connected
  logging.info('#socket - connect', socket.id)

  var clientSession = this.sessionManager.add(socket)

  clientSession.on('message', function (data) {
    self._processMessage(clientSession, data)
  })

  clientSession.on('end', function () {
    nonblocking(self.resources).forEach(function (resource) {
      // resource may have already been destroyed
      if (!resource) {
        return
      }
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
    if (to === Sentry.channel) {
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
  if (messageType.type === 'Control') {
    return
  }
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
