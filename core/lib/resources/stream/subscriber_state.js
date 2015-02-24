function StreamSubscriber(clientId) {
  this.id = clientId;
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

SubscriberState.prototype.get = function(clientId) {
  if (!this.subscribers[clientId]) {
    this.subscribers[clientId] = new StreamSubscriber(clientId);
  }
  return this.subscribers[clientId];
};

SubscriberState.prototype.remove = function(clientId) {
  delete this.subscribers[clientId];
};

module.exports = SubscriberState;
