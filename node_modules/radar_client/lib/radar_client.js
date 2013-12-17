var log = require('minilog')('radar_client'),
    MicroEE = require('microee'),
    eio = require('engine.io-client'),
    Scope = require('./scope.js'),
    StateMachine = require('./state.js');

function Client(backend) {
  var self = this;
  this._ackCounter = 1;
  this._channelSyncTimes = {};
  this._users = {};
  this._presences = {};
  this._subscriptions = {};
  this._restoreRequired = false;
  this._queuedMessages = [];
  this._isConfigured = false;

  // allow backend substitution for tests
  this.backend = backend || eio;

  this._createManager();
  this.configure(false);

  this.on('authenticateMessage', function(message) {
    if(this._configuration) {
      message.userData = this._configuration.userData;
      if (this._configuration.auth) {
        message.auth = this._configuration.auth;
        message.userId = this._configuration.userId;
        message.userType = this._configuration.userType;
        message.accountName = this._configuration.accountName;
      }
    }
    this.emit('messageAuthenticated', message);
  });

  this.on('messageAuthenticated', function(message) {
    this._sendMessage(message);
  });
}

MicroEE.mixin(Client);

// alloc() and dealloc() rather than connect() and disconnect() - see readme.md
Client.prototype.alloc = function(name, callback) {
  log.info({ op: 'alloc', name: name });
  var self = this;
  this._users[name] = true;
  callback && this.once('ready', function() {
    if(self._users.hasOwnProperty(name)) {
      callback();
    }
  });

  if (this._isConfigured) {
    this.manager.start();
  } else {
    this._waitingForConfigure = true;
  }

  return this;
};

Client.prototype.dealloc = function(name) {
  log.info({ op: 'dealloc', name: name });
  delete this._users[name];
  var stillAllocated = false, key;
  for (key in this._users) {
    if (this._users.hasOwnProperty(key)) {
      stillAllocated = true;
      break;
    }
  }
  if (!stillAllocated) {
    this.manager.close();
  }
};

Client.prototype.currentState = function() {
  return this.manager.current;
};

Client.prototype.configure = function(hash) {
  var configuration = hash || this._configuration || { accountName: '', userId: 0, userType: 0 };
  configuration.userType = configuration.userType || 0;
  this._configuration = this._me = configuration;
  this._isConfigured = this._isConfigured || !!hash;

  if (this._isConfigured && this._waitingForConfigure) {
    this._waitingForConfigure = false;
    this.manager.start();
  }

  return this;
};

Client.prototype.configuration = function(name) {
  return name in this._configuration ? JSON.parse(JSON.stringify(this._configuration[name])) : null;
};

Client.prototype.currentClientId = function() {
  return this._socket && this._socket.id;
};

Client.prototype.message = function(scope) {
  return new Scope('message:/'+this._configuration.accountName+'/'+scope, this);
};

// Access the "presence" chainable operations
Client.prototype.presence = function(scope) {
  return new Scope('presence:/'+this._configuration.accountName+'/'+scope, this);
};

// Access the "status" chainable operations
Client.prototype.status = function(scope) {
  return new Scope('status:/'+this._configuration.accountName+'/'+scope, this);
};

Client.prototype.set = function(scope, value, callback) {
  return this._write({
    op: 'set',
    to: scope,
    value: value,
    key: this._configuration.userId,
    type: this._configuration.userType
  }, callback);
};

Client.prototype.publish = function(scope, value, callback) {
  return this._write({
    op: 'publish',
    to: scope,
    value: value
  }, callback);
};

Client.prototype.subscribe = function(scope, callback) {
  return this._write({ op: 'subscribe', to: scope }, callback);
};

Client.prototype.unsubscribe = function(scope, callback) {
  return this._write({ op: 'unsubscribe', to: scope }, callback);
};

// Sync and get return the actual value of the operation
var init = function(name) {
  Client.prototype[name] = function(scope, options, callback) {
    var message = { op: name, to: scope };
    // options is a optional argument
    if (typeof options == 'function') {
      callback = options;
    } else {
      message.options = options;
    }
    // sync v1 for presence scopes acts inconsistently. The result should be a "get" message,
    // but it is actually a "online" message.
    if (name == 'sync' && !message.options && scope.match(/^presence.+/)) {
      this.once(scope, callback);
    } else {
      this.when('get', function(message) {
        if (!message || !message.to || message.to != scope) {
          return false;
        }
        if (callback) {
          callback(message);
        }
        return true;
      });
    }
    // sync/get never register or retuin acks (since they always send back a data message)
    return this._write(message);
  };
};

var props = ['get', 'sync'];
for(var i = 0; i < props.length; i++){
  init(props[i]);
}

Client.prototype._write = function(message, callback) {
  if(callback) {
    message.ack = this._ackCounter++;
    // wait ack
    this.when('ack', function(m) {
      if(!m || !m.value || m.value != message.ack) {
        return false;
      }
      callback(message);
      return true;
    });
  }
  this.emit('authenticateMessage', message);
  return this;
};

Client.prototype._batch = function(message) {
  if (!(message.to && message.value && message.time)) {
    return false;
  }

  var index = 0, data, time,
      length = message.value.length,
      newest = message.time,
      current = this._channelSyncTimes[message.to] || 0;

  for (; index < length; index = index + 2) {
    data = JSON.parse(message.value[index]);
    time = message.value[index + 1];

    if (time > current) {
      this.emit(message.to, data);
    }
    if (time > newest) {
      newest = time;
    }
  }
  this._channelSyncTimes[message.to] = newest;
};

Client.prototype._createManager = function() {
  var client = this, manager = this.manager = StateMachine.create();

  manager.on('enterState', function(state) {
    client.emit(state);
  });

  manager.on('event', function(event) {
    client.emit(event);
  });

  manager.on('connect', function(data) {
    var socket = client._socket = new client.backend.Socket(client._configuration);

    socket.once('open', function() {
      log.info("socket open", socket.id);
      manager.established();
    });

    socket.once('close', function(reason, description) {
      log.info('socket closed', socket.id, reason, description);
      socket.removeAllListeners('message');
      client._socket = null;

      // Patch for polling-xhr continuing to poll after socket close (HTTP:POST failure).
      // socket.transport is in error but not closed, so if a subsequent poll succeeds,
      // the transport remains open and polling until server closes the socket.
      if(socket.transport) {
        socket.transport.close();
      }

      if (!manager.is('closed')) {
        manager.disconnect();
      }
    });

    socket.on('message', function(message) {
      client._messageReceived(message);
    });

    manager.removeAllListeners('close');
    manager.once('close', function() {
      socket.close();
    });
  });

  manager.on('activate', function() {
    client._restore();
    client.emit('ready');
  });

  manager.on('authenticate', function() {
    // can be overridden in order to establish an authentication protocol
    manager.activate();
  });

  manager.on('disconnect', function() {
    client._restoreRequired = true;
  });
};

// Memorize subscriptions and presence states
// returns true for a message that adds to the
//   memorized subscriptions or presences
Client.prototype._memorize = function(message) {
  switch(message.op) {
    case 'unsubscribe':
      // remove from queue
      if (this._subscriptions[message.to]) {
        delete this._subscriptions[message.to];
      }
      return true;
    case 'sync':
    case 'subscribe':
      if (this._subscriptions[message.to] != 'sync') {
        this._subscriptions[message.to] = message.op;
      }
      return true;
    case 'set':
      if (message.to.substr(0, 'presence:/'.length) == 'presence:/') {
        this._presences[message.to] = message.value;
        return true;
      }
  }
  return false;
};

Client.prototype._restore = function() {
  var item, i, to, message;
  if (this._restoreRequired) {
    this._restoreRequired = false;

    log.info('restore-subscriptions');

    for (to in this._subscriptions) {
      if (this._subscriptions.hasOwnProperty(to)) {
        item = this._subscriptions[to];
        this[item](to);
      }
    }

    for (to in this._presences) {
      if (this._presences.hasOwnProperty(to)) {
        this.set(to, this._presences[to]);
      }
    }

    while (this._queuedMessages.length) {
      this._write(this._queuedMessages.shift());
    }
  }
};

Client.prototype._sendMessage = function(message) {
  var memorized = this._memorize(message);

  if (this._socket && this.manager.is('activated')) {
    this._socket.sendPacket('message', JSON.stringify(message));
  } else if (this._isConfigured) {
    this._restoreRequired = true;
    if (!memorized || message.ack) {
      this._queuedMessages.push(message);
    }
    this.manager.connectWhenAble();
  }
};

Client.prototype._messageReceived = function (msg) {
  var message = JSON.parse(msg);
  message.direction = 'in';
  log.info(message);
  switch (message.op) {
    case 'err':
    case 'ack':
    case 'get':
      this.emit(message.op, message);
      break;
    case 'sync':
      this._batch(message);
      break;
    default:
      this.emit(message.to, message);
  }
};

Client.setBackend = function(lib) { eio = lib; };

module.exports = Client;
