var http = require('http')
var Radar = require('../../index.js')
var Middleware = require('../../middleware')
var QuotaManager = Middleware.QuotaManager
var LegacyAuthManager = Middleware.LegacyAuthManager
var Persistence = require('persistence')
var Type = require('../../core').Type
var Minilog = require('minilog')
var logger = Minilog('lib_radar')
var formatter = require('./formatter.js')
var assertHelper = require('./assert_helper.js')
var serverStarted = false
var radar
var httpServer

if (process.env.verbose) {
  var minilogPipe = Minilog

  // Configure log output
  if (process.env.radar_log) {
    minilogPipe = minilogPipe.pipe(Minilog.suggest.deny(/.*/, process.env.radar_log))
  }

  minilogPipe.pipe(formatter)
    .pipe(Minilog.backends.nodeConsole.formatColor)
    .pipe(process.stdout)
}

function p404 (req, res) {
  res.statusCode = 404
  res.end('404 Not Found')
}

Type.add([
  { // For client.auth.test
    name: 'client_auth',
    expression: /^message:\/client_auth\/disabled$/,
    type: 'MessageList',
    policy: { cache: true, maxAgeSeconds: 30 },
    authProvider: {
      authorize: function () { return false }
    }
  },
  {
    name: 'client_auth',
    expression: /^message:\/client_auth\/enabled$/,
    type: 'MessageList',
    authProvider: {
      authorize: function () { return true }
    }
  },
  { // For client.message.test
    name: 'cached_chat',
    expression: /^message:\/dev\/cached_chat\/(.+)/,
    type: 'MessageList',
    policy: { cache: true, maxAgeSeconds: 30 }
  },
  { // For client.presence.test
    name: 'short_expiry',
    expression: /^presence:\/dev\/test/,
    type: 'Presence',
    policy: { userExpirySeconds: 1 }
  },
  {
    name: 'short_stream',
    expression: /^stream:\/dev\/short_stream\/(.+)/,
    type: 'Stream',
    policy: { maxLength: 2 }
  },
  {
    name: 'uncached_stream',
    expression: /^stream:\/dev\/uncached_stream\/(.+)/,
    type: 'Stream',
    policy: { maxLength: 0 }
  },
  {
    name: 'general control',
    type: 'Control',
    expression: /^control:/
  },
  { // For client.presence.test
    name: 'limited',
    expression: /^presence:\/dev\/limited/,
    type: 'Presence',
    policy: {
      limit: 1
    }
  }
])

var Service = {}

Service.start = function (configuration, callback) {
  logger.debug('creating radar', configuration)
  httpServer = http.createServer(p404)

  // Add sentry defaults for testing.
  configuration.sentry = assertHelper.SentryDefaults
  var RadarServer = Radar.server
  radar = new RadarServer()

  radar.use(new QuotaManager())
  radar.use(new LegacyAuthManager())

  radar.ready.then(function () {
    httpServer.listen(configuration.port, function () {
      logger.debug('httpServer listening on', configuration.port)
      serverStarted = true
      Persistence.delWildCard('*', function () {
        logger.info('Persistence cleared')
        callback()
      })
    })
  })

  radar.attach(httpServer, configuration)
}

Service.stop = function (arg, callback) {
  var serverTimeout
  logger.info('stop')

  httpServer.on('close', function () {
    logger.info('httpServer closed')
    if (serverStarted) {
      clearTimeout(serverTimeout)
      logger.info('Calling callback, close event')
      serverStarted = false
      callback()
    }
  })

  Persistence.delWildCard('*', function () {
    radar.terminate(function () {
      logger.info('radar terminated')
      if (!serverStarted) {
        logger.info('httpServer terminated')
        callback()
      } else {
        logger.info('closing httpServer')
        logger.info('connections left', httpServer._connections)
        httpServer.close()
        serverTimeout = setTimeout(function () {
          // Failsafe, because server.close does not always
          // throw the close event within time.
          if (serverStarted) {
            serverStarted = false
            logger.info('Calling callback, timeout')
            callback()
          }
        }, 200)
      }
    })
  })
}

process.on('message', function (message) {
  var command = JSON.parse(message)

  var complete = function (error) {
    logger.debug('complete: ', error, command.action)
    process.send(JSON.stringify({
      action: command.action,
      error: error
    }))
  }

  if (Service[command.action]) {
    Service[command.action](command.arg, complete)
  } else {
    complete('NotFound')
  }
})
