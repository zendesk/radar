var http = require('http'),
  configuration = require('./configurator.js').load({persistence: true}),
  Radar = require('./server/server.js'),
  Api = require('./api/api.js'),
  Minilog = require('minilog')

// Configure log output
Minilog.pipe(Minilog.suggest.deny(/.*/, (process.env.radar_log ? process.env.radar_log : 'debug')))
  .pipe(Minilog.backends.nodeConsole.formatWithStack)
  .pipe(Minilog.backends.nodeConsole)

function p404 (req, res) {
  console.log('Returning Error 404 for ' + req.method + ' ' + req.url)
  res.statusCode = 404
  res.end('404 Not Found')
}

var httpServer = http.createServer(p404)

// Radar API
Api.attach(httpServer)

// Radar server
var radar = new Radar()
radar.attach(httpServer, configuration)

httpServer.listen(configuration.port, function () {
  console.log('Radar Server listening on port ' + configuration.port)
})
