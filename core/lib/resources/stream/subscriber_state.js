function StreamSubscriber(socketId) {
  this.id = socketId;
  this.sent = null;
  this.sendEnabled = true;
}

StreamSubscriber.prototype.startSubscribing = function(from) {
  this.sent = from;
  this.sendEnabled = false;
};

StreamSubscriber.prototype.finishSubscribing = function() {
  this.sendEnabled = true;
};

StreamSubscriber.prototype.sendable = function(data) {
  return (this.sendEnabled && this.sent < data.id);
};

function SubscriberState() {
  this.subscribers = {};
}

SubscriberState.prototype.get = function(socketId) {
  if (!this.subscribers[socketId]) {
    this.subscribers[socketId] = new StreamSubscriber(socketId);
  }
  return this.subscribers[socketId];
};

SubscriberState.prototype.remove = function(socketId) {
  delete this.subscribers[socketId];
};

module.exports = SubscriberState;
