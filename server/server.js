var redis = require('redis'),
    MiniEventEmitter = require('miniee'),
    Core = require('../core'),
    Type = Core.Type,
    Heartbeat = require('../core/lib/Heartbeat.js'),
    logging = require('minilog')('server'),
    hostname = require('os').hostname(),
    Audit = require('./audit.js'),
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
  this.channels = {};
  this.subscriber = null;
  this.subs = {};
  this.timer = new Heartbeat().interval(15000);
}

MiniEventEmitter.mixin(Server);

// Attach to a http server
Server.prototype.attach = function(server, configuration) {

  configuration = configuration || {};
  configuration.redis_port = configuration.redis_port || 6379;
  configuration.redis_host = configuration.redis_host || 'localhost';

  Core.Persistence.setConfig(configuration);
  Core.Persistence.connect(this._setup.bind(this, server, configuration));
};

Server.prototype._setup = function(server, configuration) {
  var engine = DefaultEngineIO,
      engineConf;

  this.subscriber = Core.Persistence.pubsub();

  this.subscriber.on('message', this.handleMessage.bind(this));

  if(configuration.engineio) {
    engine = configuration.engineio.module;
    engineConf = configuration.engineio.conf;

    this.engineioPath = configuration.engineio.conf ? configuration.engineio.conf.path : 'default';
  }

  this.server = engine.attach(server, engineConf);
  this.server.on('connection', this.onClientConnection.bind(this));

  this.timer.start();
  setInterval(Audit.totals, 60 * 1000); // each minute

  logging.debug('#server_start ' + new Date().toString());
  this.emit('ready');
}

Server.prototype.onClientConnection = function(client) {
  var self = this;
  var oldSend = client.send;
  // for audit purposes
  client.send = function(data) {
    Audit.send(client);
    oldSend.call(client, JSON.stringify(data));
  };

  // event: client connected
  logging.info('#connect', client.id);

  client.send({
    server: hostname,
    cid: client.id
  });

  client.on('message', function(data) {
    Audit.receive(client);
    self.message(client, data);
  });

  client.on('close', function() {
    // event: client disconnected
    logging.info('#disconnect', client.id);

    Object.keys(self.channels).forEach(function(name) {
      var channel = self.channels[name];
      if (channel.subscribers[client.id]) {
        channel.unsubscribe(client, false);
      }
    });
  });
};

Server.prototype.handleMessage = function(name, data) {
  logging.debug('#redis_in', name, data);

  if (this.channels[name]) {
    try {
      data = JSON.parse(data);
    } catch(parseError) {
      logging.error('Corrupted key value [' + name + ']. ' + parseError.message + ': '+ parseError.stack);
      return;
    }

    this.channels[name].redisIn(data);
  } else {
    logging.warn('#message_not_handled', name, data);
  }
};

// Process a message
Server.prototype.message = function(client, data) {
  var message = parseJSON(data);

  // audit messages
  if(message.to == 'audit') {
    Audit.log(client, message);
    return;
  }

  // format check
  if(!message || !message.op || !message.to) {
    logging.warn('#message_rejected', (client && client.id), data);
    return;
  }

  logging.info('#message_received', (client && client.id), message,
     (this.channels[message.to] ? 'exists' : 'not instantiated'),
     (this.subs[message.to] ? 'is subscribed' : 'not subscribed')
    );

  var resource = this.resource(message.to);

  if (resource && resource.authorize(message, client, data)) {
    resource.handleMessage(client, message);
    this.emit(message.op, client, message);
  } else {
    logging.warn('#auth_invalid', data);
    client.send({
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
      logging.info('#redis_subscribe', name);
      this.subs[name] = true;
      this.subscriber.subscribe(name);
    } else {
      logging.error('#unknown_type', name, definition);
    }
  }
  return this.channels[name];
};

// Destroy empty channel
Server.prototype.destroy = function(name) {
  delete this.channels[name];
  delete this.subs[name];
  logging.info('#redis_unsubscribe', name);
  this.subscriber.unsubscribe(name);
};

Server.prototype.terminate = function(done) {
  var self = this;
  Object.keys(this.channels).forEach(function(name) {
    self.destroy(name);
  });

  this.timer.clear();
  this.server.close();
  Core.Persistence.disconnect(done);
};

module.exports = Server;
