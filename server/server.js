var _ = require('underscore'),
    MiniEventEmitter = require('miniee'),
    Core = require('../core'),
    Type = Core.Type,
    logging = require('minilog')('radar:server'),
    hostname = require('os').hostname(),
    DefaultEngineIO = require('engine.io'),
    Semver = require('semver'),
    Client = require('../client/client.js'),
    Middleware = require('./middleware.js'),
    QuotaManager = require('./middleware/quota_manager.js'),
    Stamper = require('../core/stamper.js');

function Server() {
  this.socketServer = null;
  this.resources = {};
  this.subscriber = null;
  this.subs = {};
  this.sentry = Core.Resources.Presence.sentry;
}

MiniEventEmitter.mixin(Server);
Middleware.mixin(Server);

// Public API

// Attach to a http server
Server.prototype.attach = function(httpServer, configuration) {
  var finishSetup = this._setup.bind(this, httpServer, configuration);
  this._setupPersistence(configuration, finishSetup);
};

// Destroy empty resource
Server.prototype.destroyResource = function(to) {
  var self = this,
      messageType = this._getMessageType(to),
      resource = this.resources[to];

  if (resource) {
    this.runMiddleware('onDestroyResource', resource, messageType, function lastly (err) {
      // TODO: Handle error.

      resource.destroy();
      delete self.resources[to];
      delete self.subs[to];
      
      if (self.subscriber) {
        logging.info('#redis - unsubscribe', to);
        self.subscriber.unsubscribe(to);
      }
    });
  }
};

Server.prototype.terminate = function(done) {
  var self = this;

  Object.keys(this.resources).forEach(function(to) {
    self.destroyResource(to);
  });

  this.sentry.stop();

  if (this.socketServer) {
    this.socketServer.close();  
  }
  
  Core.Persistence.disconnect(done);
};

// Private API

var VERSION_CLIENT_STOREDATA = '0.13.1';

Server.prototype._setup = function(httpServer, configuration) {
  var engine = DefaultEngineIO,
      engineConf;

  this.subscriber = Core.Persistence.pubsub();

  this.subscriber.on('message', this._handlePubSubMessage.bind(this));

  var oldPublish = Core.Persistence.publish;

  // Log all outgoing to redis server
  Core.Persistence.publish = function(channel, data, callback) {
    logging.info('#redis.message.outgoing', channel, data);
    oldPublish(channel, data, callback);
  };

  configuration = configuration || {};

  if (configuration.engineio) {
    engine = configuration.engineio.module;
    engineConf = configuration.engineio.conf;

    this.engineioPath = configuration.engineio.conf ?
                configuration.engineio.conf.path : 'default';
  }

  this._setupSentry(configuration);

  this.socketServer = engine.attach(httpServer, engineConf);
  this.socketServer.on('connection', this._onSocketConnection.bind(this));

  logging.debug('#server - start ' + new Date().toString());
  this.emit('ready');
};

Server.prototype._setupSentry = function(configuration) {
  var sentryOptions = {
        host: hostname,
        port: configuration.port
      };

  if (configuration.sentry) { 
    _.extend(sentryOptions, configuration.sentry); 
  }

  Stamper.setup(this.sentry.name);

  this.sentry.start(sentryOptions);
};

Server.prototype._onSocketConnection = function(socket) {
  var self = this,
      oldSend = socket.send;

  // Always send data as json
  socket.send = function(message) {
    var data = JSON.stringify(message);

    logging.info('#socket.message.outgoing', socket.id, data);
    oldSend.call(socket, data);
  };

  // Event: socket connected
  logging.info('#socket - connect', socket.id);

  socket.on('message', function(data) {
    self._handleSocketMessage(socket, data);
  });

  socket.on('close', function() {
    // Event: socket disconnected
    logging.info('#socket - disconnect', socket.id);

    Object.keys(self.resources).forEach(function(to) {
      var resource = self.resources[to];

      self.runMiddleware('onDestroyClient', socket, resource, resource.options, function lastly (err) {
        if (resource.subscribers[socket.id]) {
          resource.unsubscribe(socket, false);
        }
      });
    });
  });
};

// Process a message from persistence (i.e. subscriber)
Server.prototype._handlePubSubMessage = function(to, data) {
  if (this.resources[to]) {
    try {
      data = JSON.parse(data);
    } catch(parseError) {
      logging.error('#redis - Corrupted key value [' + to+ ']. ' + parseError.message + ': '+ parseError.stack);
      return;
    }

    logging.info('#redis.message.incoming', to, data);
    this.resources[to].redisIn(data);
  } else {
    // Don't log sentry channel pub messages
    if (to === Core.Presence.Sentry.channel) {
      return;
    }

    logging.warn('#redis - message not handled', to, data);
  }
};

// Process a socket message
Server.prototype._handleSocketMessage = function(socket, data) {
  var message = _parseJSON(data);

  if (!socket) {
    logging.info('_handleSocketMessage: socket is null');
    return;
  }

  // Format check
  if (!message || !message.op || !message.to) {
    logging.warn('#socket.message - rejected', socket.id, data);
    return;
  }
 
  logging.info('#socket.message.incoming', socket.id, JSON.stringify(message));
  this._processMessage(socket, message);
};

Server.prototype._processMessage = function(socket, message) {
  var self = this,
      messageType = this._getMessageType(message.to);

  if (!messageType) {
    logging.warn('#socket.message - unknown type', message, socket.id);
    this._sendErrorMessage(socket, 'unknown_type', message);
    return;
  }

  if (!this._authorizeMessage(socket, message, messageType)) {
    logging.warn('#socket.message - auth_invalid', message, socket.id);
    this._sendErrorMessage(socket, 'auth', message);
    return;
  }

  this.runMiddleware('onMessage', socket, message, messageType, function lastly (err) {
    if (err) {
      logging.warn('#socket.message - pre filter halted execution', message);
      return;
    }
    
    if (message.op === 'nameSync') {
      logging.info('#socket.message - nameSync', message, socket.id);
      self._initClient(socket, message);
      socket.send({ op: 'ack', value: message && message.ack });
    } else {
      self._handleResourceMessage(socket, message, messageType);
    }
  });

};

// Initialize a client, and persist messages where required
Server.prototype._persistClientData = function(socket, message) {
  var client = Client.get(socket.id);

  if (client && Semver.gte(client.version, VERSION_CLIENT_STOREDATA)) {
    logging.info('#socket.message - _persistClientData', message, socket.id);
    client.storeData(message);
  }
};

// Get a resource, subscribe where required, and handle associated message
Server.prototype._handleResourceMessage = function(socket, message, messageType) {
  var self = this,
      to = message.to,
      resource = this._getResource(message, messageType);

  if (resource) {
    logging.info('#socket.message - received', socket.id, message,
      (this.resources[to] ? 'exists' : 'not instantiated'),
      (this.subs[to] ? 'is subscribed' : 'not subscribed')
    );


    this.runMiddleware('onResource', socket, resource, message, messageType, function (err) {
      if (err) {
        logging.warn('#socket.message - post filter halted execution', message);
      } else {
        self._persistClientData(socket, message);
        self._storeResource(resource);
        self._persistenceSubscribe(resource.to, socket.id);
        self._stampMessage(socket, message);
        resource.handleMessage(socket, message);
        self.emit(message.op, socket, message);
      }
    });
  }
};

// Authorize a socket message
Server.prototype._authorizeMessage = function(socket, message, messageType) {
  var isAuthorized = true,
      provider = messageType && messageType.authProvider;
  
  if (provider && provider.authorize) {
    isAuthorized = provider.authorize(messageType, message, socket);
  }

  return isAuthorized; 
};

Server.prototype._getMessageType = function(messageScope) {
  return Type.getByExpression(messageScope);
};

// Get or create resource by "to" (aka, full scope)
Server.prototype._getResource = function(message, messageType) {
  var to = message.to,
      type = messageType.type,
      resource = this.resources[to];

  if (!resource) {
    if (type && Core.Resources[type]) {
      resource = new Core.Resources[type](to, this, messageType);
    } else {
      logging.error('#resource - unknown_type', to, messageType);
    }
  }
  return resource;
};

Server.prototype._storeResource = function(resource) {
  if (!this.resources[resource.to]) {
    this.resources[resource.to] = resource;
    this.emit('resource:new', resource);
  }
};

// Subscribe to the persistence pubsub channel for a single resource
Server.prototype._persistenceSubscribe = function (to, id) {
  if (!this.subs[to]) {
    logging.debug('#redis - subscribe', to, id);

    this.subscriber.subscribe(to, function(err) {
      if (err) {
        logging.error('#redis - subscribe failed', to, id, err);
      } else {
        logging.debug('#redis - subscribe successful', to, id);
      }
    });
    this.subs[to] = true;
  }
};

// Transforms Redis URL into persistence configuration object
Server.prototype._setupPersistence = function(configuration, done) {
  Core.Persistence.setConfig(configuration.persistence);
  Core.Persistence.connect(done);
};

Server.prototype._sendErrorMessage = function(socket, value, origin) {
  socket.send({
    op: 'err',
    value: value,
    origin: origin
  });
};

// Initialize the current client
Server.prototype._initClient = function (socket, message) {
  var client = Client.create(message);
};

Server.prototype._stampMessage = function (socket, message) {
  return Stamper.stamp(message, socket.id);
};

// Private functions
// TODO: move to util module
function _parseJSON (data) {
  var message = false;

  try {
    message = JSON.parse(data);
  } catch(e) { }

  return message;
}

module.exports = Server;
