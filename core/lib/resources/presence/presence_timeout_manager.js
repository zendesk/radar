var util = require("util");
var events = require("events");

function PresenceTimeoutManager() {
  events.EventEmitter.call(this);
  this._timeouts = [];
  this._keys = {};

  this._timeout = {
    next: null,
    plannedTriggerTime: 0
  };
}

util.inherits(PresenceTimeoutManager, events.EventEmitter);

PresenceTimeoutManager.prototype.schedule = function(key, delay, data) {
  var expiry = Date.now() + delay;

  this._keys[key] = {
    expiry: expiry,
    data: data
  };

  this._timeouts.push({key: key, expiry: expiry});

  var self = this;
  setImmediate(function() {
    self._sortTimeouts();
  });
};

PresenceTimeoutManager.prototype.has = function(key) {
  return this._keys.hasOwnProperty(key);
};

PresenceTimeoutManager.prototype.cancel = function(key) {
  delete this._keys[key];
  // there is no need to go through the list of timeouts because it will be cleared on the next timeout()
};

PresenceTimeoutManager.prototype.listQueueItems = function() {
  return Object.keys(this._keys);
};

PresenceTimeoutManager.prototype._sortTimeouts = function() {
  if(this._timeouts.length > 0) {
    this._timeouts = this._timeouts.sort(sortByTimestamp);

    // only re-schedule the timeout if the new one is later (ie. don't fire for nothing)
    if(this._timeouts[0].expiry > this._timeout.plannedTriggerTime) {
      this.rescheduleNextTimeout(this._timeouts[0].expiry);
    }
  }
};

PresenceTimeoutManager.prototype.rescheduleNextTimeout = function(expiry) {
  if(this._timeout.next) {
    clearTimeout(this._timeout.next);
  }
  var self = this;
  var delay = Math.min(expiry - Date.now(), 1000);
  this._timeout.expiry = expiry;
  this._timeout.next = setTimeout(function() {

    self._timeout.next = null;
    self.timeout();
  }, delay);
};

PresenceTimeoutManager.prototype.timeoutItem = function(item) {
  if(this._keys.hasOwnProperty(item.key) && item.expiry === this._keys[item.key].expiry) {
    var data = this._keys[item.key].data;
    delete this._keys[item.key];
    this.emit('timeout', item.key, data);
  }
}

PresenceTimeoutManager.prototype.timeout = function() {
  var now = Date.now();

  while(this._timeouts.length > 0) {
    if(this._timeouts[0].expiry <= now) {
      var tm = this._timeouts.shift();
      this.timeoutItem(tm);
    } else {
      break;
    }
  }

  if(this._timeouts.length > 0) {
    this.rescheduleNextTimeout(this._timeouts[0].expiry);
  }

};

// immediately consider all items in the queue to have timed out and process them
PresenceTimeoutManager.prototype.flush = function() {
  while(this._timeouts.length > 0) {
    var tm = this._timeouts.shift();
    this.timeoutItem(tm);
  }
}

function sortByTimestamp(a, b) {
  return a.expiry - b.expiry;
}

module.exports = PresenceTimeoutManager;