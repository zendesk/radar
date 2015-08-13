var _ = require('underscore'),
    MiniEventEmitter = require('miniee'),
    Util = require('../util.js'),
    Core = require('../core'),
    Type = Core.Type,
    logging = require('minilog')('radar:server'),
    hostname = require('os').hostname(),
    DefaultEngineIO = require('engine.io'),
    Semver = require('semver'),
    Client = require('../client/client.js'),
    Pauseable = require('pauseable'),
    RateLimiter = require('../core/rate_limiter.js');

function Server() {
  this.socketServer = null;
  this.resources = {};
  this.subscriber = null;
  this.subs = {};
  this.sentry = Core.Resources.Presence.sentry;
  this._rateLimiters = {};
}

MiniEventEmitter.mixin(Server);

// Public API

// Attach to a http server
Server.prototype.attach = function(httpServer, configuration) {
  Client.setDataTTL(configuration.clientDataTTL);
  
  var finishSetup = this._setup.bind(this, httpServer, configuration);
  this._setupPersistence(configuration, finishSetup);
};

// Destroy empty resource
Server.prototype.destroyResource = function(name) {
  var messageType = this._getMessageType(name);

  if (this.resources[name]) {
    this.resources[name].destroy();
  }

  if (this._rateLimiters[messageType.name]) {
    this._rateLimiters[messageType.name].removeByName(name);
  }
  
  delete this.resources[name];
  delete this.subs[name];
  logging.info('#redis - unsubscribe', name);
  this.subscriber.unsubscribe(name);
};

Server.prototype.terminate = function(done) {
  var self = this;

  Object.keys(this.resources).forEach(function(name) {
    self.destroyResource(name);
  });

  this.sentry.stop();
  this.socketServer.close();
  Core.Persistence.disconnect(done);
};

// Private API

var VERSION_CLIENT_STOREDATA = '0.13.1';

Server.prototype._setup = function(httpServer, configuration) {
  var engine = DefaultEngineIO,
      engineConf;

  this.subscriber = Core.Persistence.pubsub();

  this.subscriber.on('message', this._handlePubSubMessage.bind(this));

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

  this.sentry.start(sentryOptions);
};

Server.prototype._onSocketConnection = function(socket) {
  var self = this,
      oldSend = socket.send;

  // Always send data as json
  socket.send = function(data) {
    logging.info('#socket - sending data', socket.id, data);
    oldSend.call(socket, JSON.stringify(data));
  };

  // Event: socket connected
  logging.info('#socket - connect', socket.id);

  socket.on('message', function(data) {
    self._handleSocketMessage(socket, data);
  });

  socket.on('close', function() {
    // Event: socket disconnected
    logging.info('#socket - disconnect', socket.id);

    Object.keys(self.resources).forEach(function(name) {
      var resource = self.resources[name],
          rateLimiter = self._getRateLimiterForMessageType(resource.options);

      if (rateLimiter) {
        rateLimiter.remove(socket.id, name);
      }

      if (resource.subscribers[socket.id]) {
        resource.unsubscribe(socket, false);
      }
    });
  });
};

// Process a message from persistence (i.e. subscriber)
Server.prototype._handlePubSubMessage = function(name, data) {
  if (this.resources[name]) {
    try {
      data = JSON.parse(data);
    } catch(parseError) {
      logging.error('#redis - Corrupted key value [' + name + ']. ' + parseError.message + ': '+ parseError.stack);
      return;
    }

    this.resources[name].redisIn(data);
  } else {
    // Don't log sentry channel pub messages
    if (name === Core.Presence.Sentry.channel) {
      return;
    }

    logging.warn('#redis - message not handled', name, data);
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
  
  this._processMessage(socket, message);
};

Server.prototype._processMessage = function(socket, message) {
  var messageType = this._getMessageType(message.to);

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

  if (this._limited(socket, message, messageType, message.to)) {
    logging.warn('#socket.message - rate_limited', message, socket.id);
    this._sendErrorMessage(socket, 'rate limited', message);
    return;
  }

  if (message.op === 'nameSync') {
    logging.info('#socket.message - nameSync', message, socket.id);
    this._initClient(socket, message);
    socket.send({ op: 'ack', value: message && message.ack });
    return;
  }

  this._handleResourceMessage(socket, message, messageType);
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
  var name = message.to,
      resource = this._getResource(message, messageType);

  if (resource) {
    logging.info('#socket.message - received', socket.id, message,
      (this.resources[name] ? 'exists' : 'not instantiated'),
      (this.subs[name] ? 'is subscribed' : 'not subscribed')
    );

    this._persistClientData(socket, message);
    this._storeResource(resource);
    this._persistenceSubscribe(resource.name, socket.id);
    this._updateLimits(socket, message, resource.options);
    this._stampMessage(socket, message);
    resource.handleMessage(socket, message);
    this.emit(message.op, socket, message);
  }
};

// Process the existing persisted messages associated with a single client
Server.prototype._replayMessagesFromClient = function (socket, client) {
  var subscriptions = client.subscriptions,
      presences = client.presences,
      message,
      messageType,
      key;

  // Pause events on the inbound socket
  Pauseable.pause(socket);

  for (key in subscriptions) {
    message = subscriptions[key];
    messageType = this._getMessageType(message.to);
    this._handleResourceMessage(socket, message, messageType); 
  }

  for (key in presences) {
    message = presences[key];
    messageType = this._getMessageType(message.to);
    this._handleResourceMessage(socket, message, messageType);
  }

  // Resume events on the inbound socket
  Pauseable.resume(socket);
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

Server.prototype._limited = function(socket, message, messageType) {
  var isLimited = false,
      rateLimiter = this._getRateLimiterForMessageType(messageType);

  if (message.op !== 'subscribe' && message.op !== 'sync') {
    return false;
  }
  
  if (rateLimiter && rateLimiter.isAboveLimit(socket.id)) {
    logging.warn('#socket.message - rate limited', message, socket.id);
    isLimited = true;
  }

  return isLimited;
};

Server.prototype._updateLimits = function(socket, message, messageType) {
  var rateLimiter = this._getRateLimiterForMessageType(messageType);

  if (rateLimiter) {
    switch(message.op) {
      case 'sync':
      case 'subscribe': 
        rateLimiter.add(socket.id, message.to);
        break;
      case 'unsubscribe': 
        rateLimiter.remove(socket.id, message.to);
        break;
    }
  }
};

Server.prototype._getRateLimiterForMessageType = function(messageType) {
  var rateLimiter;

  if (messageType && messageType.policy && messageType.policy.limit) {
    rateLimiter = this._rateLimiters[messageType.name];

    if (!rateLimiter) {
      // TODO: subscribe, as rate limiter operation, should be configurable. 
      rateLimiter = new RateLimiter(messageType.policy.limit);
      this.emit('rate_limiter:add', messageType.name, rateLimiter);
      this._rateLimiters[messageType.name] = rateLimiter;
    }
  }
  
  return rateLimiter;
};

Server.prototype._getMessageType = function(messageScope) {
  return Type.getByExpression(messageScope);
};

// Get or create resource by name
Server.prototype._getResource = function(message, messageType) {
  var name = message.to,
      type = messageType.type,
      resource = this.resources[name];

  if (!resource) {
    if (type && Core.Resources[type]) {
      resource = new Core.Resources[type](name, this, messageType);
    } else {
      logging.error('#resource - unknown_type', name, messageType);
    }
  }
  return resource;
};

Server.prototype._storeResource = function(resource) {
  if (!this.resources[resource.name]) {
    this.resources[resource.name] = resource;
    this.emit('resource:new', resource);
  }
};

// Subscribe to the persistence pubsub channel for a single resource
Server.prototype._persistenceSubscribe = function (name, id) {
  if (!this.subs[name]) {
    logging.debug('#redis - subscribe', name, id);

    this.subscriber.subscribe(name, function(err) {
      if (err) {
        logging.error('#redis - subscribe failed', name, id, err);
      } else {
        logging.debug('#redis - subscribe successful', name, id);
      }
    });
    this.subs[name] = true;
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
  if (client) {
    client.loadData(this._replayMessagesFromClient.bind(this, socket, client));
  }
};

Server.prototype._stampMessage = function(socket, message) {
  message.stamp = {
    id: Util.uuid(),
    clientId: socket.id,
    sentryId: this.sentry.name
  };

  return message;
};

function _parseJSON(data) {
  try {
    var message = JSON.parse(data);
    return message;
  } catch(e) { }
  return false;
}

module.exports = Server;
