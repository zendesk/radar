var http = require('http'),

    eio = require('engine.io'),

    RadarServer = new require('../server.js');

http.globalAgent.maxSockets = 10000;

var radar

module.exports = {
  // starts a Radar server at the given port
  startRadar: function(port, context, done) {
    context.server = http.createServer(function(req, res) { res.end('Running.'); });
    context.serverStarted = true;
    radar = new RadarServer();
    radar.attach(context.server, eio);
    context.server.listen(port, function() {
      done()
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
      done();
    });
    radar.terminate();
    context.server.close();
  }
}
