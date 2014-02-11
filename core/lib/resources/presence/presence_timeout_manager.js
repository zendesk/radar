var util = require("util");
var events = require("events");

function PresenceTimeoutManager() {
  events.EventEmitter.call(this);
  this._keys = {};
}

util.inherits(PresenceTimeoutManager, events.EventEmitter);

PresenceTimeoutManager.prototype.schedule = function(key, delay, data) {

  this.cancel(key);

  var self = this;

  this._keys[key] = {
    data: data, // needed for the flush
    timeout: setTimeout(function() {
      self.emit('timeout', key, data);
      self.cancel(key)
    }, delay)
  };
};

PresenceTimeoutManager.prototype.has = function(key) {
  return this._keys.hasOwnProperty(key);
};

PresenceTimeoutManager.prototype.cancel = function(key) {
  if(this.has(key)) {
    clearTimeout(this._keys[key].timeout);
    delete this._keys[key];
    return true;
  }
  return false;
};

// immediately consider all items in the queue to have timed out and process them
PresenceTimeoutManager.prototype.flush = function() {
  for(var key in this._keys) {
    if(this._keys.hasOwnProperty(key)) {
      this.emit('timeout', key, this._keys[key].data);
      this.cancel(key);
    }
  }
}

module.exports = PresenceTimeoutManager;