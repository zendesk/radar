var logging = require('minilog')('radar:presence:sentry'),
    Persistence = require('persistence');

function parse(message) {
  try {
    return JSON.parse(message);
  } catch (e) { }
}

function Sentry(name) {
  this.name = name;
  this.sentries = {};
}

Sentry.expiry = 20000;
Sentry.channel = 'sentry:/radar';

require('util').inherits(Sentry, require('events').EventEmitter);

Sentry.prototype._listen = function() {
  var self = this;
  if(!this.listener) {
    this.listener = function(channel, m) {
      if(channel != Sentry.channel) {
        return;
      }
      self._save(parse(m));
    };
    Persistence.pubsub().on('message', this.listener);
  }
  if(!this.subscribed) {
    this.subscribed = true;
    Persistence.pubsub().subscribe(Sentry.channel);
  }
};


Sentry.prototype._save = function(message) {
  if(message && message.name) {
    logging.debug('#presence - sentry.save', message.name, (message.expiration - Date.now())+'/'+Sentry.expiry);
    this.sentries[message.name] = message;
  }
};

Sentry.prototype._sentryDown = function(name) {
  if(!this.isValid(name)) {
    Persistence.deleteHash(Sentry.channel, name); //cleanup
    var details = this.sentries[name];
    logging.info('#presence - #sentry down:', name,
                    details.host, details.port);
    delete this.sentries[name];
    this.emit('down', name, details);
  }
};

Sentry.prototype._run = function() {
  this.publishKeepAlive();
  Object.keys(this.sentries).forEach(this._sentryDown.bind(this));
  this.timer = setTimeout(this._run.bind(this), Math.floor(Sentry.expiry/2));
};

//read initial state
Sentry.prototype.loadAll = function(callback) {
  var sentries = this.sentries;
  var self = this;
  Persistence.readHashAll(Sentry.channel, function(replies) {
    replies = replies || {};
    Object.keys(replies).forEach(function(name) {
      sentries[name] = replies[name];
      if(!self.isValid(name)) {
        Persistence.deleteHash(Sentry.channel, name); //cleanup
        delete sentries[name];
      }
    });
    if(callback) callback();
  });
};
//API

Sentry.prototype.publishKeepAlive = function(options) {
  options = options || {};
  var name = options.name || this.name; //publish on behalf of someone else
  var expiration = options.expiration || Date.now() + Sentry.expiry;  //custom expiry
  var host = this.host;
  var port = this.port;

  var message = {
    name: name,
    alive: true,
    host: host,
    port: port,
    expiration: expiration
  };

  this.sentries[name] = message;

  if(options.save === false) return; /*specific check*/

  Persistence.persistHash(Sentry.channel, this.name, message);
  Persistence.publish(Sentry.channel, message);
};

Sentry.prototype.start = function(callback) {
  var sentries = this.sentries;
  var self = this;
  if(this.timer) {
    return;
  }
  logging.info('#presence - #sentry - starting', this.name);
  this._listen();
  this.publishKeepAlive();
  this.loadAll(callback);
  this.timer = setTimeout(this._run.bind(this), Math.floor(Sentry.expiry/2));
};

Sentry.prototype.stop = function() {
  logging.info('#presence - #sentry stopping', this.name);
  if(this.timer) {
    clearTimeout(this.timer);
    delete this.timer;
  }
  Persistence.pubsub().unsubscribe(Sentry.channel);
  delete this.subscribed;
  if(this.listener) {
    Persistence.pubsub().removeListener('message', this.listener);
    delete this.listener;
  }
  this.sentries = {};
};

Sentry.prototype.isValid = function(name) {
  var message = this.sentries[name];
  var valid = (message && message.expiration && (message.expiration >= Date.now()));
  var expiration = (message && message.expiration && (message.expiration - Date.now()));

  if(!valid) logging.debug('#presence - #sentry isValid', name, valid, (expiration)?expiration+'/'+Sentry.expiry:'not-present');
  return valid;
};

Sentry.prototype.setHostPort = function(host, port) {
  this.host = host;
  this.port = port;
};

module.exports = Sentry;
