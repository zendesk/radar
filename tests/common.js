var http = require('http'),
    eio = require('engine.io'),
    Persistence = require('../core/lib/persistence'),
    RadarServer = new require('../server/server.js'),
    configuration = {
      redis_port: 6379,
      redis_host: 'localhost',
      port: 8001
    },
    radar;

if (process.env.verbose) {
  var Minilog = require('minilog');
  Minilog.pipe(Minilog.backends.nodeConsole)
    .format(Minilog.backends.nodeConsole.formatWithStack);
}

require('long-stack-traces');


http.globalAgent.maxSockets = 10000;

module.exports = {
  // starts a Radar server at the given port
  startRadar: function(port, context, done) {
    Persistence.setConfig(configuration);
    Persistence.select(1);
    context.server = http.createServer(function(req, res) { res.end('Running.'); });
    context.serverStarted = true;
    radar = new RadarServer();
    radar.attach(context.server, configuration);
    context.server.listen(port, function() {
      done();
    });
  },

  radar: function() {
    return radar;
  },

  // ends the Radar server
  endRadar: function(context, done) {
    if(!context.serverStarted) return done();
    context.server.on('close', function() {
      context.serverStarted = false;
      Persistence.delWildCard('*', done);
    });
    radar.terminate();
    context.server.close();
  },

  configuration: configuration
};
