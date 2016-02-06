function SocketClientSessionAdapter (clientSessionCtor) {
  this.ClientSession = clientSessionCtor
}

SocketClientSessionAdapter.prototype.adapt = function (socket) {
  var clientSession = new this.ClientSession(undefined, socket.id, undefined, undefined, socket)
  return clientSession
}

// (Any) => Boolean
SocketClientSessionAdapter.prototype.canAdapt = function (socket) {
  return Boolean(socket &&
    socket.id &&
    typeof socket.send === 'function' &&
    isEventEmitter(socket))
}

function isEventEmitter (o) {
  return typeof o.on === 'function' &&
    typeof o.once === 'function' &&
    typeof o.removeListener === 'function'
}

module.exports = SocketClientSessionAdapter
