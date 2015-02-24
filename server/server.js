var MiniEventEmitter = require('miniee'),
    Core = require('../core'),
    Type = Core.Type,
    logging = require('minilog')('radar:server'),
    hostname = require('os').hostname(),
    DefaultEngineIO = require('engine.io');

// Parse JSON
function parseJSON(data) {
  try {
    var message = JSON.parse(data);
    return message;
  } catch(e) { }
  return false;
}

function Server() {
  this.server = null;
  this.resources = {};
  this.subscriber = null;
  this.subs = {};
}

MiniEventEmitter.mixin(Server);

// Attach to a http server
Server.prototype.attach = function(http_server, configuration) {
  Core.Persistence.setConfig(configuration);
  Core.Persistence.connect(this._setup.bind(this, http_server, configuration));
};

Server.prototype._setup = function(http_server, configuration) {
  var engine = DefaultEngineIO,
      engineConf;

  configuration = configuration || {};
  this.subscriber = Core.Persistence.pubsub();

  this.subscriber.on('message', this.handlePubSubMessage.bind(this));

  Core.Resources.Presence.sentry.start();
  Core.Resources.Presence.sentry.setMaxListeners(0);
  Core.Resources.Presence.sentry.setHostPort(hostname, configuration.port);

  if (configuration.engineio) {
    engine = configuration.engineio.module;
    engineConf = configuration.engineio.conf;

    this.engineioPath = configuration.engineio.conf ?
                configuration.engineio.conf.path : 'default';
  }

  this.server = engine.attach(http_server, engineConf);
  this.server.on('connection', this.onClientConnection.bind(this));

  logging.debug('#server - start ' + new Date().toString());
  this.emit('ready');
};

Server.prototype.onClientConnection = function(client) {
  var self = this;
  var oldSend = client.send;

  // Always send data as json
  client.send = function(data) {
    logging.info('#client - sending data', client.id, data);
    oldSend.call(client, JSON.stringify(data));
  };

  // Event: client connected
  logging.info('#client - connect', client.id);

  client.send({
    server: hostname,
    cid: client.id
  });

  client.on('message', function(data) {
    self.message(client, data);
  });

  client.on('close', function() {
    // Event: client disconnected
    logging.info('#client - disconnect', client.id);

    Object.keys(self.resources).forEach(function(name) {
      var resource = self.resources[name];
      if (resource.subscribers[client.id]) {
        resource.unsubscribe(client, false);
      }
    });
  });
};

Server.prototype.handlePubSubMessage = function(name, data) {
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
    if (name == Core.Presence.Sentry.channel) return;

    logging.warn('#redis - message not handled', name, data);
  }
};

// Process a message
Server.prototype.message = function(client, data) {
  var message = parseJSON(data);

  // Format check
  if (!message || !message.op || !message.to) {
    logging.warn('#client.message - rejected', (client && client.id), data);
    return;
  }

  logging.info('#client.message - received', (client && client.id), message,
     (this.resources[message.to] ? 'exists' : 'not instantiated'),
     (this.subs[message.to] ? 'is subscribed' : 'not subscribed')
    );

  var resource = this.resourceGet(message.to);

  if (resource && resource.authorize(message, client, data)) {
    if (!this.subs[resource.name]) {
      logging.info('#redis - subscribe', resource.name, (client && client.id));
      this.subscriber.subscribe(resource.name, function(err) {
        if (err) {
          logging.error('#redis - subscribe failed', resource.name,
                                          (client && client.id), err);
        } else {
          logging.info('#redis - subscribe successful', resource.name,
                                          (client && client.id));
        }
      });
      this.subs[resource.name] = true;
    }
    resource.handleMessage(client, message);
    this.emit(message.op, client, message);
  } else {
    logging.warn('#client.message - auth_invalid', data, (client && client.id));
    client.send({
      op: 'err',
      value: 'auth',
      origin: message
    });
  }
};

// Get or create resource by name
Server.prototype.resourceGet = function(name) {
  if (!this.resources[name]) {
    var definition = Type.getByExpression(name);

    if (definition && Core.Resources[definition.type]) {
      this.resources[name] = new Core.Resources[definition.type](name, this, definition);
    } else {
      logging.error('#resource - unknown_type', name, definition);
    }
  }
  return this.resources[name];
};

// Destroy empty resource
Server.prototype.destroyResource = function(name) {
  if (this.resources[name]) {
    this.resources[name].destroy();
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

  Core.Resources.Presence.sentry.stop();
  this.server.close();
  Core.Persistence.disconnect(done);
};

module.exports = Server;
