var http = require('http'),
    eio = require('engine.io'),
    Persistence = require('../core/lib/persistence'),
    RadarServer = new require('../server/server.js'),
    configuration = require('./configuration.js'),
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
  startRadar: function(context, done) {
    Persistence.setConfig(configuration);
    context.server = http.createServer(function(req, res) { res.end('Running.'); });
    context.serverStarted = true;
    radar = new RadarServer();
    radar.once('ready', function() {
      context.server.listen(configuration.port, function() {
        done();
      });
    });
    radar.attach(context.server, configuration);
  },

  radar: function() {
    return radar;
  },

  // ends the Radar server
  endRadar: function(context, done) {
    context.server.on('close', function() {
      context.serverStarted = false;
      done();
    });
    Persistence.delWildCard('*', function() {
      radar.terminate(function() {
        if(!context.serverStarted) {
          done();
        }
        else
          context.server.close();
      });
    });
  },

  configuration: configuration
};
