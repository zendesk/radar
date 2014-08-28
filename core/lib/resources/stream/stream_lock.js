var Persistence = require('persistence');

var DEFAULT_TIMEOUT_SEC = 10;
function StreamLock(scope, timeout) {
  this.scope = 'stream_lock:/'+scope;
  this.timeout = timeout || DEFAULT_TIMEOUT_SEC;
}

require('util').inherits(StreamLock, require('events').EventEmitter);

StreamLock.prototype.acquire = function(callback) {
  var redis = Persistence.redis(),
      lock = this;

  this.cleanupExpiry();
  redis.set(this.scope, 'locked', 'EX', this.timeout, 'NX', function(error, val) {
    if(val != 'OK') {
      lock.setupExpiry();
    }
    callback(error, (val === 'OK'));
  });
};

StreamLock.prototype.processListeners = function() {
  while(this.acquired) {
    var listener = this.listeners.shift();
    listener();
  }
};

StreamLock.prototype.setupExpiry = function() {
  this.timer = this.timer || setTimeout(function() {
    delete this.timer;
    this.emit('expired');
  }, this.timeout);
};

StreamLock.prototype.cleanupExpiry = function() {
  if(this.timer) {
    clearTimeout(this.timer);
    delete this.timer;
  }
};

StreamLock.prototype.release = function() {
  Persistence.redis().del(this.scope);
  this.cleanupExpiry();
  this.emit('released');
};

module.exports = StreamLock;
