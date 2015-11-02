var _ = require('underscore'),
    MiniEventEmitter = require('miniee'),
    Core = require('../core'),
    Type = Core.Type,
    logging = require('minilog')('radar:server'),
    hostname = require('os').hostname(),
    DefaultEngineIO = require('engine.io'),
    Semver = require('semver'),
    Client = require('../client/client.js'),
    Pauseable = require('pauseable'),
    RateLimiter = require('../core/rate_limiter.js'),
    Request = require('radar_message').Request,
    Response = require('radar_message').Response,
    Stamper = require('../core/stamper.js');

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
  var finishSetup = this._setup.bind(this, httpServer, configuration);
  this._setupPersistence(configuration, finishSetup);
};

// Destroy empty resource
Server.prototype.destroyResource = function(to) {
  var messageType = this._getMessageType(to);

  if (this.resources[to]) {
    this.resources[to].destroy();
  }

  if (this._rateLimiters[messageType.name]) {
    this._rateLimiters[messageType.name].removeByTo(to);
  }
  
  delete this.resources[to];
  delete this.subs[to];
  logging.info('#redis - unsubscribe', to);
  this.subscriber.unsubscribe(to);
};

Server.prototype.terminate = function(done) {
  var self = this;

  Object.keys(this.resources).forEach(function(to) {
    self.destroyResource(to);
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
      var resource = self.resources[to],
          rateLimiter = self._getRateLimiterForMessageType(resource.options);

      if (rateLimiter) {
        rateLimiter.remove(socket.id, to);
      }

      if (resource.subscribers[socket.id]) {
        resource.unsubscribe(socket, false);
      }
    });
  });
};

// Process a message from persistence (i.e. subscriber)
Server.prototype._handlePubSubMessage = function(to, data) {
  var message;

  if (this.resources[to]) {
    try {
      message = JSON.parse(data);
    } catch(parseError) {
      logging.error('#redis - Corrupted key value [' + to+ ']. ' + parseError.message + ': '+ parseError.stack);
      return;
    }

    logging.info('#redis.message.incoming', to, message);
    this.resources[to].redisIn(message);
  } else {
    // Don't log sentry channel pub messages
    if (to === Core.Presence.Sentry.channel) {
      return;
    }

    logging.warn('#redis - message not handled', to, message);
  }
};

// Process a socket message
Server.prototype._handleSocketMessage = function(socket, data) {
  var request = new Request(Request.parse(data));

  if (!request.isValid()) {
    logging.warn('#socket.message - rejected', socket.id, data);
    return;
  }
 
  logging.info('#socket.message.incoming', socket.id, data);
  this._processRequest(socket, request);
};

Server.prototype._processRequest = function(socket, request) {
  var message = request.getMessage(),
      to = request.getAttr('to'),
      ack = request.getAttr('ack'),
      messageType = this._getMessageType(to);

  if (!messageType) {
    logging.warn('#socket.request - unknown type', message, socket.id);
    this._sendError(socket, 'unknown_type', message);
    return;
  }

  if (!this._authorizeMessage(socket, request, messageType)) {
    logging.warn('#socket.request - auth_invalid', message, socket.id);
    this._sendError(socket, 'auth', message);
    return;
  }

  if (this._limited(socket, request, messageType, to)) {
    logging.warn('#socket.request - rate_limited', message, socket.id);
    this._sendError(socket, 'rate limited', message);
    return;
  }

  if (request.isOp('nameSync')) {
    logging.info('#socket.request - nameSync', message, socket.id);
    this._initClient(socket, request);
    response = new Response({ op: 'ack', to: to, value: ack });
    if (response.isFor(request) && response.isAckFor(request)) {
      socket.send(response.getMessage());
    }
    return;
  }

  this._handleResourceMessage(socket, request, messageType);
};

// Initialize a client, and persist messages where required
Server.prototype._persistClientData = function(socket, request) {
  var client = Client.get(socket.id);

  if (client && Semver.gte(client.version, VERSION_CLIENT_STOREDATA)) {
    logging.info('#socket.message - _persistClientData', request.getMessage(), socket.id);
    client.storeData(request);
  }
};

// Get a resource, subscribe where required, and handle associated request message
Server.prototype._handleResourceMessage = function(socket, request, messageType) {
  var to = request.getAttr('to'),
      op = request.getAttr('op'),
      message = request.getMessage(),
      resource = this._getResource(request, messageType);

  if (resource) {
    logging.info('#socket.request - received', socket.id, message,
      (this.resources[to] ? 'exists' : 'not instantiated'),
      (this.subs[to] ? 'is subscribed' : 'not subscribed')
    );

    this._persistClientData(socket, request);
    this._storeResource(resource);
    this._persistenceSubscribe(resource.to, socket.id);
    this._updateLimits(socket, request, resource.options);
    this._stampRequest(socket, request);
    resource.handleMessage(socket, request);
    this.emit(op, socket, message);
  }
};

// Authorize a socket message
Server.prototype._authorizeMessage = function(socket, request, messageType) {
  var isAuthorized = true,
      provider = messageType && messageType.authProvider;
  
  if (provider && provider.authorize) {
    isAuthorized = provider.authorize(messageType, request.getMessage(), socket);
  }

  return isAuthorized; 
};

Server.prototype._limited = function(socket, request, messageType) {
  var isLimited = false,
      rateLimiter = this._getRateLimiterForMessageType(messageType),
      op = request.getAttr('op');

  if (op !== 'subscribe' && op !== 'sync') {
    return false;
  }
  
  if (rateLimiter && rateLimiter.isAboveLimit(socket.id)) {
    logging.warn('#socket.request - rate limited', request.getMessage(), socket.id);
    isLimited = true;
  }

  return isLimited;
};

Server.prototype._updateLimits = function(socket, request, messageType) {
  var rateLimiter = this._getRateLimiterForMessageType(messageType),
      op = request.getAttr('op'),
      to = request.getAttr('to');

  if (rateLimiter) {
    switch(op) {
      case 'sync':
      case 'subscribe': 
        rateLimiter.add(socket.id, to);
        break;
      case 'unsubscribe': 
        rateLimiter.remove(socket.id, to);
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

// Get or create resource by "to" (aka, full scope)
Server.prototype._getResource = function(request, messageType) {
  var to = request.getAttr('to'),
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

Server.prototype._sendError = function(socket, value, origin) {
  var response = new Response({op: 'err', value: value, origin: origin});
  if (response.isValid()) {
    socket.send(response.getMessage());
  }
};

// Initialize the current client
Server.prototype._initClient = function (socket, request) {
  Client.create(request);
};

Server.prototype._stampRequest = function(socket, request) {
  return Stamper.stamp(request.getMessage(), socket.id);
};

module.exports = Server;
