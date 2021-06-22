const http = require('http')
const path = require('path')
const logging = require('minilog')('common')
const formatter = require('./lib/formatter')
const Persistence = require('persistence')
const { server: RadarServer } = require('../index')
const configuration = require('../configurator').load({ persistence: true })
const Sentry = require('../src/core/resources/presence/sentry')
const { constructor: Client } = require('radar_client')
const { fork } = require('child_process')
const Tracker = require('callback_tracker')

Sentry.expiry = 4000
if (process.env.verbose) {
  const Minilog = require('minilog')
  // Configure log output
  Minilog.pipe(Minilog.suggest.deny(/.*/, (process.env.radar_log ? process.env.radar_log : 'debug')))
    .pipe(formatter)
    .pipe(Minilog.backends.nodeConsole.formatColor)
    .pipe(process.stdout)

  require('radar_client')._log.pipe(Minilog.suggest.deny(/.*/, (process.env.radar_log ? process.env.radar_log : 'debug')))
    .pipe(formatter)
    .pipe(Minilog.backends.nodeConsole.formatColor)
    .pipe(process.stdout)
}

http.globalAgent.maxSockets = 10000

module.exports = {
  spawnRadar: function () {
    function getListener (action, callbackFn) {
      const listener = function (message) {
        message = JSON.parse(message)
        logging.debug('message received', message, action)
        if (message.action === action) {
          if (callbackFn) callbackFn(message.error)
        }
      }
      return listener
    }

    const radarProcess = fork(path.join(__dirname, '/lib/radar.js'))
    radarProcess.sendCommand = function (command, arg, callbackFn) {
      const listener = getListener(command, function (error) {
        logging.debug('removing listener', command)
        radarProcess.removeListener('message', listener)
        if (callbackFn) callbackFn(error)
      })

      radarProcess.on('message', listener)
      radarProcess.send(JSON.stringify({
        action: command,
        arg: configuration
      }))
    }

    process.on('exit', function () {
      if (radarProcess.running) {
        radarProcess.kill()
      }
    })

    radarProcess.running = true
    radarProcess.port = configuration.port
    return radarProcess
  },

  stopRadar: function (radar, done) {
    radar.sendCommand('stop', {}, function () {
      radar.kill()
      radar.running = false
      done()
    })
  },

  restartRadar: function (radar, configuration, clients, callbackFn) {
    const tracker = Tracker.create('server restart, given clients ready', function () {
      if (callbackFn) setTimeout(callbackFn, 5)
    })

    for (let i = 0; i < clients.length; i++) {
      clients[i].once('ready', tracker('client ' + i + ' ready'))
    }

    const serverRestart = tracker('server restart')

    radar.sendCommand('stop', {}, function () {
      radar.sendCommand('start', configuration, serverRestart)
    })
  },

  startPersistence: function (done) {
    Persistence.setConfig(configuration.persistence)
    Persistence.connect(function () {
      Persistence.delWildCard('*', done)
    })
  },
  endPersistence: function (done) {
    Persistence.delWildCard('*', function () {
      Persistence.disconnect(done)
    })
  },
  getClient: function (account, userId, userType, userData, done) {
    const client = new Client().configure({
      userId: userId,
      userType: userType,
      accountName: account,
      port: configuration.port,
      upgrade: false,
      userData: userData
    }).once('ready', done).alloc('test')
    return client
  },
  configuration: configuration,

  // Create an in-process radar server, not a child process.
  createRadarServer: function (done) {
    const notFound = function p404 (req, res) {}
    const httpServer = http.createServer(notFound)

    const radarServer = new RadarServer()
    radarServer.attach(httpServer, configuration)

    if (done) {
      setTimeout(done, 200)
    }

    return radarServer
  }
}
