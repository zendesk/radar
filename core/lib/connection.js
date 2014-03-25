var redisLib = require('redis'),
    Tracker = require('callback_tracker'),
    sentinelLib = require('redis-sentinel-client'),
    logging = require('minilog')('connection'),
    async = require('async');

function redisConnect(config) {
  var client = redisLib.createClient(config.redis_port, config.redis_host);
  if (config.redis_auth) {
    client.auth(config.redis_auth);
  }

  logging.info('Created a new Redis client.');
  return client;
}

function sentinelConnect(config) {
  var client,
      redisAuth = config.redis_auth,
      sentinelMaster = config.id,
      sentinels = config.sentinels,
      index, sentinelHost, sentinelPort;

  if(!sentinels || !sentinels.length) {
    throw new Error('Provide a valid sentinel cluster configuration ');
  }

  //Pick a random sentinel for now.
  //Only one is supported by redis-sentinel-client,
  //if it's down, let's hope the next round catches the right one.
  index = Math.floor(Math.random()*sentinels.length);
  sentinelHost = sentinels[index].host;
  sentinelPort = sentinels[index].port;

  if(!sentinelPort || !sentinelHost) {
    throw new Error('Provide a valid sentinel cluster configuration ');
  }

  client = sentinelLib.createClient(sentinelPort, sentinelHost, {
    auth_pass: redisAuth,
    masterName: sentinelMaster
  });

  logging.info('Created a new Sentinel client.');
  return client;
}

function Connection(name, config) {
  this.name = name;
  this.config = config;
  this.client = null;
  this.subscriber = null;
  this.readyListeners = [];
  this.teardownListeners = [];
}

Connection.prototype.selectMethod = function() {
  var method = redisConnect;
  if(this.config.id || this.config.sentinels) {
    method = sentinelConnect;
  }
  return method;
};

Connection.prototype.establishDone = function() {
  var readyListeners = this.readyListeners;
  this.readyListeners = [];

  async.eachLimit(readyListeners, 10, function(listener, next) {
    if(listener) {
      listener();
    }
    next();
  });
};

Connection.prototype.teardownDone = function() {
  var teardownListeners = this.teardownListeners;
  this.teardownListeners = [];

  async.eachLimit(teardownListeners, 10, function(listener, next) {
    if(listener) {
      listener();
    }
    next();
  });
};

Connection.prototype.isReady = function() {
  return (this.client && this.client.connected &&
          this.subscriber && this.subscriber.connected);
};

Connection.prototype.establish = function(ready) {
  ready = ready || function() {};
  var self = this;

  this.readyListeners.push(ready);

  if(this.isReady()) {
    return this.establishDone();
  }

  if(this.readyListeners.length == 1) {
    var tracker = Tracker.create('establish :' + this.name , function() {
      self.establishDone();
    });

    var method = this.selectMethod();

    //create a client (read/write)
    this.client = method(this.config);
    logging.info('Created a new client.');
    this.client.once('ready', tracker('client ready :'+ this.name));

    //create a pubsub client
    this.subscriber = method(this.config);
    logging.info('Created a new subscriber.');
    this.subscriber.once('ready', tracker('subscriber ready :'+ this.name));
  }
};

Connection.prototype.teardown = function(callback) {
  var self = this;
  callback = callback || function() {};

  this.teardownListeners.push(callback);

  if(this.teardownListeners.length == 1) {
    var tracker = Tracker.create('teardown: ' + this.name , function() {
      self.teardownDone();
    });

    if(this.client) {
      if(this.client.connected) {
        this.client.quit(tracker('quit client :'+ this.name));
      }
      this.client = null;
    }

    if(this.subscriber) {
      if(this.subscriber.connected) {
        this.subscriber.quit(tracker('quit subscriber :'+ this.name));
      }
      this.subscriber = null;
    }

    tracker('client && subscriber checked')();
  }
};

module.exports = Connection;
