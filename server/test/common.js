var http = require('http'),

    eio = require('engine.io'),

    Radar = require('../server.js');

http.globalAgent.maxSockets = 100;

module.exports = {
  // starts a Radar server at the given port
  startRadar: function(port, context, done) {
    context.server = http.createServer(function(req, res) { res.end('Running.'); });
    context.serverStarted = true;
    Radar.attach(context.server, eio);
    context.server.listen(port, done);
  },
  // ends the Radar server
  endRadar: function(context, done) {
    Radar.terminate();
    if(!context.serverStarted) return done();
    context.server.on('close', function() {
      context.serverStarted = false;
      done();
    }).close();
  }
}
