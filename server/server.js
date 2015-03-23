var MiniEventEmitter = require('miniee'),
    Core = require('../core'),
    Type = Core.Type,
    logging = require('minilog')('radar:server'),
    hostname = require('os').hostname(),
    DefaultEngineIO = require('engine.io');

function Server() {
  this.clientData = {};
  this.clientNames = {};
  this.server = null;
  this.resources = {};
  this.subscriber = null;
  this.subs = {};
}

MiniEventEmitter.mixin(Server);

// Public API

// Attach to a http server
Server.prototype.attach = function(http_server, configuration) {
  Core.Persistence.setConfig(configuration);
  Core.Persistence.connect(this._setup.bind(this, http_server, configuration));
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

// Private API

// 86400000:  number of milliseconds in 1 day
var DEFAULT_TTL = 50000;

// 900000:  number of milliseconds in 15 minutes
var DEFAULT_PERIOD = 20000;

Server.prototype._setup = function(http_server, configuration) {
  var engine = DefaultEngineIO,
      engineConf;

  configuration = configuration || {};
  this.subscriber = Core.Persistence.pubsub();

  this.subscriber.on('message', this._handlePubSubMessage.bind(this));

  Core.Resources.Presence.sentry.start();
  Core.Resources.Presence.sentry.setMaxListeners(0);
  Core.Resources.Presence.sentry.setHostPort(hostname, configuration.port);

  if (configuration.engineio) {
    engine = configuration.engineio.module;
    engineConf = configuration.engineio.conf;

    this.engineioPath = configuration.engineio.conf ?
                configuration.engineio.conf.path : 'default';
  }

  // Set up unique name for server
  this.name = hostname + '_' + configuration.port;

  this._setupClientData(configuration);

  this.server = engine.attach(http_server, engineConf);
  this.server.on('connection', this._onClientConnection.bind(this));

  logging.debug('#server - start ' + new Date().toString());
  this.emit('ready');
};

Server.prototype._onClientConnection = function(client) {
  var self = this;
  var oldSend = client.send;

  // Always send data as json
  client.send = function(data) {
    logging.info('#client - sending data', client.id, data);
    oldSend.call(client, JSON.stringify(data));
  };

  // Event: client connected
  logging.info('#client - connect', client.id);

  client.on('message', function(data) {
    self._handleClientMessage(client, data);
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
    if (name == Core.Presence.Sentry.channel) return;

    logging.warn('#redis - message not handled', name, data);
  }
};

// Process a client message
Server.prototype._handleClientMessage = function(client, data) {
  var message = _parseJSON(data);

  if (!client) {
    logging.info('_handleClientMessage: client is NULL...');
    return;
  }

  // Format check
  if (!message || !message.op || !message.to) {
    logging.warn('#client.message - rejected', client.id, data);
    return;
  }

  // Sync the client name to the current client id
  if (message.op == 'name_id_sync') {
    this.clientNames[message.value.id] = message.value.name;
    //console.log('***** client.id', message.value.id, 'client name', message.value.name);
    return;
  }

  if (!this._clientDataStore(client.id, message)) {
    return;
  }

  console.log('_handleClientMessage:', this.clientData);

  logging.info('#client.message - received', client.id, message,
     (this.resources[message.to] ? 'exists' : 'not instantiated'),
     (this.subs[message.to] ? 'is subscribed' : 'not subscribed')
    );

  var resource = this._resourceGet(message.to);

  if (resource && resource.authorize(message, client, data)) {
    this._persistenceSubscribe(resource.name, client.id)
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

// Subscribe to the persistence pubsub channel for a single resource
Server.prototype._persistenceSubscribe = function (name, id) {
  if (!this.subs[name]) {
    logging.info('#redis - subscribe', name, id);
    this.subscriber.subscribe(name, function(err) {
      if (err) {
        logging.error('#redis - subscribe failed', name, id, err);
      } else {
        logging.info('#redis - subscribe successful', name, id);
      }
    });
    this.subs[name] = true;
  }
}

// Get or create resource by name
Server.prototype._resourceGet = function(name) {
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

function _parseJSON(data) {
  try {
    var message = JSON.parse(data);
    return message;
  } catch(e) { }
  return false;
}

Server.prototype._clientDataStore = function (id, message) {
  var clientName;
  console.log('message0:', message);
  if (this.clientNames[id]) {
    clientName = this.clientNames[id];
  }
  else {
    logging.error('client.id:', id, 'does not have corresponding name');
    console.log('Did NOT find client name for client.id', id);
    return false;
  }

  // Fetch the current instance, or create a new one
  var clientDatum = this.clientData[clientName];
  if (!clientDatum) {
    clientDatum = {
      timestamp: Date.now(),
      subscriptions : {},
      presences : {}
    };
    this.clientData[clientName] = clientDatum;
  }
  subscriptions = clientDatum.subscriptions;
  presences = clientDatum.presences;

  // Persist the message data, according to type
  var changed = true;
  switch(message.op) {
    case 'unsubscribe':
      if (subscriptions[message.to]) {
        delete subscriptions[message.to];
      }
      break;

    case 'sync':
    case 'subscribe':
      clientDatum.timestamp = Date.now();
      subscriptions[message.to] = message.op;
      break;

    case 'set':
      clientDatum.timestamp = Date.now();
      if (message.to.substr(0, 'presence:/'.length) == 'presence:/') {
        presences[message.to] = message.value;
      }
      break;

    default:
      changed = false;
  }

  // TODO: perhaps do this every N "stores"
  if (changed) {
    Core.Persistence.persistHash(this.name, clientName, clientDatum);
  }

  return true;
};

// Determine whether or not client data is current for a given clientName
Server.prototype._isCurrent = function(clientName, timestamp) {
  var current = timestamp + this.clientDataOnServerTTL >= Date.now();

  console.log('timestamp + this.clientDataOnServerTTL:',
                timestamp + this.clientDataOnServerTTL, 'Date.now():', Date.now());

  logging.debug('#clientdata - _isCurrent', clientName, current,
                    !!timestamp ? timestamp : 'not-present');
  return current;
};

// For a given clientName, remove client data from persistence and from memory
Server.prototype._purgeClientData = function(clientName) {
  if (this.clientData[clientName] &&
          !this._isCurrent(clientName, this.clientData[clientName].timestamp)) {

    Core.Persistence.deleteHash(this.name, clientName);
    delete this.clientData[clientName];

    console.log('#clientdata - purge data for clientName:', clientName);
    console.log('#clientdata - remaining data:', this.clientData);
    console.log('#clientdata - remaining names:', this.clientNames);

    logging.info('#clientdata - remove for clientName:', clientName);
  }
};

// For each client attached to this server, purge aged-out client data
Server.prototype._scheduleClientDataPurge = function() {
  //console.log('clientData keys:', Object.keys(this.clientData));
  Object.keys(this.clientData).forEach(this._purgeClientData.bind(this));
  this.timer = setTimeout(this._scheduleClientDataPurge.bind(this),
                                  this.clientDataOnServerCurrentPeriod);
};

// Read client state from persistence, deleting expired data on load
Server.prototype._loadClientDataFromPersistence = function () {
  var clientData = this.clientData;
  var self = this;

  Core.Persistence.readHashAll(this.name, function (valueObj) {
    var vo = valueObj || {};

    Object.keys(vo).forEach(function (clientName) {
      var clientDatum = vo[clientName];
      if (!self._isCurrent(clientName, vo[clientName].timestamp)) {
        console.log('Drop persistence data for clientName:', clientName);
        Core.Persistence.deleteHash(self.name, clientName);
      }
      else {
        self.clientData[clientName] = vo[clientName];
      }
    });
  });
};

// Load client data load from persistence, set up client data attributes, and
// schedule purge of old client data
Server.prototype._setupClientData = function (configuration) {
  this.clientDataOnServerTTL = configuration.clientDataOnServerTTL || DEFAULT_TTL;
  this.clientDataOnServerCurrentPeriod =
    configuration.clientDataOnServerCurrentPeriod || DEFAULT_PERIOD;

  this._loadClientDataFromPersistence();

  this.timer = this._scheduleClientDataPurge();
}

module.exports = Server;
