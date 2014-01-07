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

PresenceTimeoutManager.prototype.schedule = function(key, delay) {
  this._keys[key] = Date.now() + delay;
  this._timeouts.push({key: key, timestamp: this._keys[key]});
  this.asyncSortTimeouts();
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

PresenceTimeoutManager.prototype.asyncSortTimeouts = function() {
  if(this._timeouts.length > 0) {
    var self = this;
    setImmediate(function() {
      self._timeouts = self._timeouts.sort(sortByTimestamp);

      // only re-schedule the timeout if the new one is later (ie. don't fire for nothing)
      if(self._timeouts[0].timestamp > self._timeout.plannedTriggerTime) {
        self.rescheduleNextTimeout(self._timeouts[0].timestamp);
      }
    });
  }
};

PresenceTimeoutManager.prototype.rescheduleNextTimeout = function(timestamp) {
  if(this._timeout.next) {
    clearTimeout(this._timeout.next);
  }
  var self = this;
  var delay = timestamp - Date.now();
  this._timeout.timestamp = timestamp;
  this._timeout.next = setTimeout(function() {

    self._timeout.next = null;
    self.timeout();
  }, delay);
};

PresenceTimeoutManager.prototype.timeoutItem = function(item) {
  if(this._keys.hasOwnProperty(item.key)) {
    delete this._keys[item.key];
    this.emit('timeout', item.key);
  }
}

PresenceTimeoutManager.prototype.timeout = function() {
  var now = Date.now();

  while(this._timeouts.length > 0) {
    if(this._timeouts[0].timestamp <= now) {
      var tm = this._timeouts.shift();
      this.timeoutItem(tm);
    } else {
      break;
    }
  }

  if(this._timeouts.length > 0) {
    this.rescheduleNextTimeout(this._timeouts[0].timestamp);
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
  return a.timestamp - b.timestamp;
}

module.exports = PresenceTimeoutManager;