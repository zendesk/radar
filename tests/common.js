var http = require('http'),
    logging = require('minilog')('common'),
    eio = require('engine.io'),
    Persistence = require('../core/lib/persistence'),
    RadarServer = new require('../server/server.js'),
    configuration = require('../configuration.js'),
    Client = require('radar_client').constructor,
    fork = require('child_process').fork,
    Tracker = require('callback_tracker'),
    radar;

if (process.env.verbose) {
  var Minilog = require('minilog');
  Minilog.pipe(Minilog.backends.nodeConsole)
    .format(Minilog.backends.nodeConsole.formatWithStack);

  //require('radar_client')._log.pipe(Minilog.backends.nodeConsole)
   // .format(Minilog.backends.nodeConsole.formatWithStack);
}
//Disabling, https://github.com/tlrobinson/long-stack-traces/issues/6
//require('long-stack-traces');

if(process.env.radar_connection) {
  configuration.use_connection = process.env.radar_connection;
}


http.globalAgent.maxSockets = 10000;

module.exports = {
  spawnRadar: function() {
    var radarProcess;

    function getListener(action, callback) {
      var listener = function(message) {
        message = JSON.parse(message);
        logging.info("message received", message, action);
        if(message.action == action) {
          if(callback) callback(message.error);
        }
      };
      listener.action = action;
      return listener;
    }

    radarProcess = fork(__dirname + '/lib/radar.js');
    radarProcess.sendCommand = function(command, arg, callback) {
      var listener = getListener(command, function(error) {
        logging.info("removing listener", command, listener.action);
        radarProcess.removeListener('message', listener);
        if(callback) callback(error);
      });

      radarProcess.on('message', listener);
      radarProcess.send(JSON.stringify({
        action: command,
        arg: configuration
      }));
    };
    return radarProcess;
  },

  restartRadar: function(radar, configuration, clients, callback) {
    var tracker = Tracker.create('server restart, given clients ready', function() {
      if(callback) setTimeout(callback,0);
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
