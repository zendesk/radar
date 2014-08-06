var MiniEventEmitter = require('miniee'),
    Core = require('../core'),
    Type = Core.Type,
    logging = require('minilog')('radar:server'),
    DefaultEngineIO = require('engine.io'),
    RESTClient = require('./rest_client'),
    url = require('url'),
    collect = require('collect-stream');

// Parse JSON
function parseJSON(data) {
  try {
    var message = JSON.parse(data);
    return message;
  } catch(e) { }
  return false;
}

function sendJSON(data) {
  logging.info('#client - sending data', this.id, data);
  return this.send(JSON.stringify(data));
}

function Server() {
  this.server = null;
  this.channels = {};
  this.subscriber = null;
  this.subs = {};
}

MiniEventEmitter.mixin(Server);

// Attach to a http server
Server.prototype.attach = function(http_server, configuration) {
  Core.Persistence.setConfig(configuration);
  Core.Persistence.connect(this._setup.bind(this, http_server, configuration));
};

Server.prototype._setup = function(httpServer, configuration) {
  var engine = DefaultEngineIO,
      engineConf;

  this.httpServer = httpServer;

  configuration = configuration || {};
  this.subscriber = Core.Persistence.pubsub();

  this.subscriber.on('message', this.handleMessage.bind(this));

  Core.Resources.Presence.sentry.start();
  Core.Resources.Presence.sentry.setMaxListeners(0);

  if(configuration.engineio) {
    engine = configuration.engineio.module;
    engineConf = configuration.engineio.conf;

    this.engineioPath = configuration.engineio.conf ? configuration.engineio.conf.path : 'default';
  }


  this.server = engine.attach(httpServer, engineConf);
  this.server.on('connection', this.onClientConnection.bind(this));

  this.httpListeners = httpServer.listeners('request').slice(0);
  httpServer.removeAllListeners('request');
  httpServer.on('request', this.handleHTTPRequest.bind(this));

  logging.debug('#server - start ' + new Date().toString());
  this.emit('ready');
};

Server.prototype.apiPathRegExp = /^\/(api|ping)/;

Server.prototype.handleHTTPRequest = function(request, response) {
  var uri = url.parse(request.url);

  if (this.apiPathRegExp.test(uri.path || '')) {
    var client = new RESTClient(request, response);

    if (RegExp.$2 == 'ping') {
      client.ping();
    } else if (request.method == 'POST') {
      this.onClientConnection(client);
      request.pipe(process.stdout);
      collect(request, function(error, data) {
        client.emit('message', data);
      });
    }
  } else if (this.httpListeners && this.httpListeners.length) {
    for (var i = 0, l = this.httpListeners.length; i < l; ++i) {
      this.httpListeners[i].call(this.httpServer, request, response);
    }
  }
};

Server.prototype.onClientConnection = function(client) {
  var self = this;

  client.sendJSON = client.sendJSON || sendJSON;

  // event: client connected
  logging.info('#client - connect', client.id);

  client.on('message', function(data) {
    self.message(client, data);
  });

  client.on('close', function() {
    // event: client disconnected
    logging.info('#client - disconnect', client.id);

    Object.keys(self.channels).forEach(function(name) {
      var channel = self.channels[name];
      if (channel.subscribers[client.id]) {
        channel.unsubscribe(client, false);
      }
    });
  });
};

Server.prototype.handleMessage = function(name, data) {
  if (this.channels[name]) {
    try {
      data = JSON.parse(data);
    } catch(parseError) {
      logging.error('#redis - Corrupted key value [' + name + ']. ' + parseError.message + ': '+ parseError.stack);
      return;
    }

    this.channels[name].redisIn(data);
  } else {
    if(name == Core.Presence.Sentry.channel) return; //limit unwanted logs
    logging.warn('#redis - message not handled', name, data);
  }
};

// Process a message
Server.prototype.message = function(client, data) {
  var message = parseJSON(data);

  // format check
  if(!message || !message.op || !message.to) {
    logging.warn('#client.message - rejected', (client && client.id), data);
    return;
  }

  logging.info('#client.message - received', (client && client.id), message,
     (this.channels[message.to] ? 'exists' : 'not instantiated'),
     (this.subs[message.to] ? 'is subscribed' : 'not subscribed')
    );

  var resource = this.resource(message.to);

  if (resource && resource.authorize(message, client, data)) {
    if(!this.subs[resource.name]) {
      logging.info('#redis - subscribe', resource.name, (client && client.id));
      this.subscriber.subscribe(resource.name, function(err) {
        if(err) {
          logging.error('#redis - subscribe failed', resource.name, (client && client.id), err);
        } else {
          logging.info('#redis - subscribe successful', resource.name, (client && client.id));
        }
      });
      this.subs[resource.name] = true;
    }
    resource.handleMessage(client, message);
    this.emit(message.op, client, message);
  } else {
    logging.warn('#client.message - auth_invalid', data, (client && client.id));
    client.sendJSON({
      op: 'err',
      value: 'auth',
      origin: message
    });
  }
};

// Get or create channel by name
Server.prototype.resource = function(name) {
  if (!this.channels[name]) {
    var definition = Type.getByExpression(name);

    if (definition && Core.Resources[definition.type]) {
      this.channels[name] = new Core.Resources[definition.type](name, this, definition);
    } else {
      logging.error('#resource - unknown_type', name, definition);
    }
  }
  return this.channels[name];
};

// Destroy empty channel
Server.prototype.destroy = function(name) {
  if(this.channels[name]) {
    this.channels[name].destroy();
  }
  delete this.channels[name];
  delete this.subs[name];
  logging.info('#redis - unsubscribe', name);
  this.subscriber.unsubscribe(name);
};

Server.prototype.terminate = function(done) {
  var self = this;
  Object.keys(this.channels).forEach(function(name) {
    self.destroy(name);
  });

  Core.Resources.Presence.sentry.stop();
  this.server.close();
  Core.Persistence.disconnect(done);
};

module.exports = Server;
