var http = require('http'),
    eio = require('engine.io'),
    Persistence = require('../core/lib/persistence'),
    RadarServer = new require('../server/server.js'),
    radar;

// use a different db for testing
Persistence.setConfig({redis_port:27000, redis_host:'localhost'});
//Persistence.select(1);

http.globalAgent.maxSockets = 10000;

module.exports = {
  // starts a Radar server at the given port
  startRadar: function(port, context, done) {
    Persistence.connect(function() {
      context.server = http.createServer(function(req, res) { res.end('Running.'); });
      context.serverStarted = true;
      radar = new RadarServer();
      radar.attach(context.server, {redis_port:27000});
      context.server.listen(port, function() {
        done();
      });
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
  }
};
