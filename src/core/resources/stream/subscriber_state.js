function StreamSubscriber (clientSessionId) {
  this.id = clientSessionId
  this.sent = null
  this.sendEnabled = true
}

StreamSubscriber.prototype.startSubscribing = function (from) {
  this.sent = from
  this.sendEnabled = false
}

StreamSubscriber.prototype.finishSubscribing = function () {
  this.sendEnabled = true
}

StreamSubscriber.prototype.sendable = function (data) {
  return (this.sendEnabled && this.sent < data.id)
}

function SubscriberState () {
  this.subscribers = {}
}

SubscriberState.prototype.get = function (clientSessionId) {
  if (!this.subscribers[clientSessionId]) {
    this.subscribers[clientSessionId] = new StreamSubscriber(clientSessionId)
  }
  return this.subscribers[clientSessionId]
}

SubscriberState.prototype.remove = function (clientSessionId) {
  delete this.subscribers[clientSessionId]
}

module.exports = SubscriberState
