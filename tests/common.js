var http = require('http'),
    logging = require('minilog')('common'),
    Persistence = require('../core/lib/persistence'),
    RadarServer = new require('../server/server.js'),
    configuration = require('./configuration.js'),
    Client = require('radar_client').constructor,
    radar;

if (process.env.verbose) {
  var Minilog = require('minilog');
  Minilog.pipe(Minilog.backends.nodeConsole)
    .format(Minilog.backends.nodeConsole.formatWithStack);
}

http.globalAgent.maxSockets = 10000;

module.exports = {
  startPersistence: function(done) {
    if(process.env.radar_connection) {
      configuration.use_connection = process.env.radar_connection;
    }
    Persistence.setConfig(configuration);
    Persistence.connect(function() {
      Persistence.delWildCard('*', done);
    });
  },
  endPersistence: function(done) {
    Persistence.delWildCard('*', function() {
      Persistence.disconnect(done);
    });
  },
  // starts a Radar server at the given port
  startRadar: function(context, done) {
    if(process.env.radar_connection) {
      configuration.use_connection = process.env.radar_connection;
    }
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
    logging.info('in endRadar');
    context.server.on('close', function() {
      logging.info('server closed');
      if(context.serverStarted) {
        clearTimeout(context.serverTimeout);
        logging.info('Calling done, close event');
        context.serverStarted = false;
        done();
      }
    });
    Persistence.delWildCard('*', function() {
      radar.terminate(function() {
        logging.info('radar terminated');
        if(!context.serverStarted) {
          logging.info('server terminated');
          done();
        }
        else {
          logging.info('closing server');
          logging.info(context.server._connections);
          context.server.close();
          context.serverTimeout = setTimeout(function() {
            //failsafe, because server.close does not always
            //throw the close event within time.
            if(context.serverStarted) {
              context.serverStarted = false;
              logging.info('Calling done, timeout');
              done();
            }
          }, 1000);
        }
      });
    });
  },

  getClient: function(account, userId, userType, userData, done) {
      var client = new Client().configure({
        userId: userId,
        userType: userType,
        accountName: account,
        port: configuration.port,
        upgrade: false,
        userData: userData,
      }).once('ready', done).alloc('test');
      return client;
  },
  configuration: configuration
};
