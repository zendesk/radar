// Use a single heartbeat object that can be explicitly cleared when running tests
function Heartbeat() {
  this._actions = [];
  this._loop = false;
  this._interval = 60 * 1000;
}

Heartbeat.prototype.interval = function(millis) {
  this._interval = millis;
  return this;
};

Heartbeat.prototype.nextTimeout = function(millis) {
  if(this._loop) {
    this.pause();
  }
  var self = this;
  this._loop = setTimeout(function() { Heartbeat.prototype._runActions(self); }, millis);
  return this;
};


Heartbeat.prototype.start = Heartbeat.prototype.resume = function() {
  if(this._loop) {
    return this;
  }
  var self = this;
  this._loop = setTimeout(function() { Heartbeat.prototype._runActions(self); }, this._interval);
  return this;
};

Heartbeat.prototype.add = function(callback) {
  this._actions.push(callback);
  return this;
};

Heartbeat.prototype.remove = function(callback) {
  var i = this._actions.length-1;
  while(i >= 0) {
    if(this._actions[i] === callback) {
      this._actions.splice(i, 1);
    }
    i--;
  }
  return this;
};

Heartbeat.prototype.pause = function() {
  if (this._loop) {
    clearTimeout(this._loop);
    this._loop = false;
  }
  return this;
};

Heartbeat.prototype.clear = function() {
  this.pause();
  this._actions = [];
  return this;
};

Heartbeat.prototype.isActive = function() {
  return !!this._loop;
};

Heartbeat.prototype._runActions = function(self) {
  var i, len = self._actions.length;
  for(i = 0; i < len; i++) {
    if (self._actions[i]) {
      self._actions[i]();
    }
  }
  // using setTimeout, since it is safer and easier to control
  // - only set the next interval once all actions have run
  self._loop = setTimeout(function() { Heartbeat.prototype._runActions(self);}, self._interval);
};

module.exports = Heartbeat;
