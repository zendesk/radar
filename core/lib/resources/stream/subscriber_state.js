function StreamSubscriber(clientId) {
  this.id = clientId;
  this.sent = null;
  this.sendDisabled = false;
}

StreamSubscriber.prototype.startSubscribing = function(from) {
  this.sent = from;
  this.sendDisabled = true;
};

StreamSubscriber.prototype.finishSubscribing = function() {
  this.sendDisabled = false;
};

StreamSubscriber.prototype.sendable = function(data) {
  return (!this.sendDisabled && this.sent < data.id);
};

function SubscriberState(scope) {
  this.subscribers = {};
}

SubscriberState.prototype.get = function(clientId) {
  if(!this.subscribers[clientId]) {
    this.subscribers[clientId] = new StreamSubscriber(clientId);
  }
  return this.subscribers[clientId];
};

SubscriberState.prototype.remove = function(clientId) {
  delete this.subscribers[clientId];
};

module.exports = SubscriberState;
