var http = require('http'),
    Radar = require('../../index.js'),
    configuration = require('../../configuration.js'),
    Persistence = require('../../core/lib/persistence'),
    Type = require('../../core').Type,
    Minilog = require('minilog'),
    logger = require('minilog')('lib_radar'),
    radar, http_server, serverStarted = false;

if(process.env.verbose) {
  var stdoutPipe = Minilog.pipe(Minilog.backends.nodeConsole);
  stdoutPipe
    .filter(Minilog.backends.nodeConsole.filterEnv(process.env.radar_log))
    .format(Minilog.backends.nodeConsole.formatWithStack);
}

function p404(req, res) {
  res.statusCode = 404;
  res.end('404 Not Found');
}

// For client.auth.test
Type.add([
    {
      name: 'client_auth',
      expression: /^message:\/client_auth\/disabled$/,
      type: 'MessageList',
      authProvider: {
        authorize: function() { return false; }
      }
    },
    {
      name: 'cached_chat',
      expression: /^message:\/dev\/cached_chat\/(.+)/,
      type: 'MessageList',
      policy: { cache: true, maxAgeSeconds: 30 }
    }
]);

Type.add([{
  name: 'client_auth',
  expression: /^message:\/client_auth\/enabled$/,
  type: 'MessageList',
  authProvider: {
    authorize: function() { return true; }
  }
}]);

function Service() {
}

Service.start = function(configuration, callback) {
  logger.debug('creating radar', configuration);
  http_server = http.createServer(p404);
  radar = new Radar.server();
  radar.once('ready', function() {
    logger.debug('radar ready');
    http_server.listen(configuration.port, function() {
      logger.debug('http_server listening on', configuration.port);
      serverStarted = true;
      Persistence.delWildCard('*',function() {
        logger.info('Persistence cleared');
        callback();
      });
    });
  });
  radar.attach(http_server, configuration);
};

Service.stop = function(arg, callback){
  logger.info("stop");
  http_server.on('close', function() {
    logger.info("http_server closed");
    if(serverStarted) {
      clearTimeout(serverTimeout);
      logger.info("Calling callback, close event");
      serverStarted = false;
      callback();
    }
  });
  Persistence.delWildCard('*', function() {
    radar.terminate(function() {
      logger.info("radar terminated");
      if(!serverStarted) {
        logger.info("http_server terminated");
        callback();
      }
      else {
        logger.info("closing http_server");
        logger.info(http_server._connections);
        var val = http_server.close();
        serverTimeout = setTimeout(function() {
          //failsafe, because server.close does not always
          //throw the close event within time.
          if(serverStarted) {
            serverStarted = false;
            logger.info("Calling callback, timeout");
            callback();
          }
        }, 200);
      }
    });
  });
};

process.on('message', function(message) {
  var command = JSON.parse(message);

  var complete = function(error) {
    logger.debug("complete: ", error, command.action);
    process.send(JSON.stringify({
      action: command.action,
      error: error
    }));
  };

  if(Service[command.action]) {
    Service[command.action](command.arg, complete);
  } else {
    complete('NotFound');
  }
});
