var hostname = require('os').hostname()
var Sentry = require('./sentry.js')
var nonblocking = require('nonblocking')

function SentryManager(radar_server, configuration) {
  var self = this
  var sentryOptions = {
    host: hostname,
    port: configuration.port
  }

  if (configuration.sentry) {
    _.extend(sentryOptions, configuration.sentry)
  }
  this.server = radar_server
  this.sentry = new Sentry()

  this.sentry.on("down", function sentryDownListener(sentryId) {
    var presences = self.server.resources.filter(function(r) { return(r.type == 'presence') })

    nonblocking(presences).forEach(function(presence) {
      var sockets = presence.socketsForSentry(sentryId)
      nonblocking(sockets).forEach(function(socket) {
        presence.disconnectRemoteClient(socket)
      })
    })
  })

  this.sentry.start(sentryOptions)
}

SentryManager.prototype.channel = function() {
  return this.sentry.channel
}

SentryManager.prototype.name = function() {
  return this.sentry.name
}

SentryManager.prototype.destroy = function() {
  this.sentry.stop()
}

SentryManager.prototype.handleSentryDown = functon(sentryId) {
  var presences = server.resources.filter(function(r) { return(r.type == 'presence') })
  nonblocking(presences).forEach(function(presence) {
    var sockets = presence.socketsForSentry(sentryId)
    nonblocking(sockets).forEach(function(socket) {
      presence.disconnectRemoteClient(socket)
    })
  })
}
