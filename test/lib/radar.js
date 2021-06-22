const http = require('http')
const Radar = require('../../index.js')
const Middleware = require('../../src/middleware')
const { QuotaManager, LegacyAuthManager } = Middleware
const Persistence = require('persistence')
const { Type } = require('../../src/core')
const Minilog = require('minilog')
const logger = Minilog('lib_radar')
const formatter = require('./formatter.js')
const assertHelper = require('./assert_helper.js')
let serverStarted = false
let radar
let httpServer

if (process.env.verbose) {
  let minilogPipe = Minilog

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

const Service = {}

Service.start = function (configuration, callbackFn) {
  logger.debug('creating radar', configuration)
  httpServer = http.createServer(p404)

  // Add sentry defaults for testing.
  configuration.sentry = assertHelper.SentryDefaults
  const RadarServer = Radar.server
  radar = new RadarServer()

  radar.use(new QuotaManager())
  radar.use(new LegacyAuthManager())

  radar.ready.then(function () {
    httpServer.listen(configuration.port, function () {
      logger.debug('httpServer listening on', configuration.port)
      serverStarted = true
      Persistence.delWildCard('*', function () {
        logger.info('Persistence cleared')
        callbackFn()
      })
    })
  })

  radar.attach(httpServer, configuration)
}

Service.stop = function (arg, callbackFn) {
  let serverTimeout
  logger.info('stop')

  httpServer.on('close', function () {
    logger.info('httpServer closed')
    if (serverStarted) {
      clearTimeout(serverTimeout)
      logger.info('Calling callbackFn, close event')
      serverStarted = false
      callbackFn()
    }
  })

  Persistence.delWildCard('*', function () {
    radar.terminate(function () {
      logger.info('radar terminated')
      if (!serverStarted) {
        logger.info('httpServer terminated')
        callbackFn()
      } else {
        logger.info('closing httpServer')
        logger.info('connections left', httpServer._connections)
        httpServer.close()
        serverTimeout = setTimeout(function () {
          // Failsafe, because server.close does not always
          // throw the close event within time.
          if (serverStarted) {
            serverStarted = false
            logger.info('Calling callbackFn, timeout')
            callbackFn()
          }
        }, 200)
      }
    })
  })
}

process.on('message', function (message) {
  const command = JSON.parse(message)

  const complete = function (error) {
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
