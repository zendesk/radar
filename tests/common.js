var http = require('http'),
    logging = require('minilog')('common'),
    formatter = require('./lib/formatter.js'),
    Persistence = require('persistence'),
    RadarServer = new require('../index.js').server,
    configuration = require('../configuration.js'),
    Sentry = require('../core/lib/resources/presence/sentry.js'),
    Client = require('radar_client').constructor,
    fork = require('child_process').fork,
    Tracker = require('callback_tracker'),
    radar;

Sentry.expiry = 4000;
if (process.env.verbose) {
  var Minilog = require('minilog');
  // Configure log output
  Minilog.pipe(Minilog.suggest.deny(/.*/, (process.env.radar_log ? process.env.radar_log : 'debug')))
    .pipe(formatter)
    .pipe(Minilog.backends.nodeConsole.formatColor)
    .pipe(process.stdout);

  require('radar_client')._log.pipe(Minilog.suggest.deny(/.*/, (process.env.radar_log ? process.env.radar_log : 'debug')))
    .pipe(formatter)
    .pipe(Minilog.backends.nodeConsole.formatColor)
    .pipe(process.stdout);
}

if (process.env.radar_connection) {
  configuration.use_connection = process.env.radar_connection;
}


http.globalAgent.maxSockets = 10000;

module.exports = {
  spawnRadar: function() {
    var radarProcess;

    function getListener(action, callback) {
      var listener = function(message) {
        message = JSON.parse(message);
        logging.debug("message received", message, action);
        if (message.action == action) {
          if (callback) callback(message.error);
        }
      };
      return listener;
    }

    radarProcess = fork(__dirname + '/lib/radar.js');
    radarProcess.sendCommand = function(command, arg, callback) {
      var listener = getListener(command, function(error) {
        logging.debug("removing listener", command);
        radarProcess.removeListener('message', listener);
        if (callback) callback(error);
      });

      radarProcess.on('message', listener);
      radarProcess.send(JSON.stringify({
        action: command,
        arg: configuration
      }));
    };

    process.on('exit', function() {
      if (radarProcess.running) {
        radarProcess.kill();
      }
    });

    radarProcess.running = true;

    return radarProcess;
  },

  stopRadar: function(radar, done) {
    radar.sendCommand('stop', {}, function() {
      radar.kill();
      radar.running = false;
      done();
    });
  },

  restartRadar: function(radar, configuration, clients, callback) {
    var tracker = Tracker.create('server restart, given clients ready', function() {
      if (callback) setTimeout(callback,0);
    });

    for(var i = 0; i < clients.length; i++) {
      clients[i].once('ready', tracker('client '+i+' ready'));
    }

    var server_restart = tracker('server restart');

    radar.sendCommand('stop', {}, function() {
      radar.sendCommand('start', configuration, server_restart);
    });
  },

  startPersistence: function(done) {
    if (process.env.radar_connection) {
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
