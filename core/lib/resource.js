var Persistence = require('persistence'),
    MiniEventEmitter = require('miniee'),
    logging = require('minilog')('radar:resource');

/*

Resources
=========

- have a type, one of:

  - have statuses, which are a hash of values. Values never expire by themselves, they are always explicitly set.
  - have messages, which are an ordered set of messages

- can be subscribed to (e.g. pubsub)

- can be synchronized (e.g. read full set of values, possibly applying some filtering), if it is a status or message

*/

function recursiveMerge(target) {
  Array.prototype.slice.call(arguments, 1).forEach(function(source) {
    if (source) {
      Object.keys(source).forEach(function(name) {
        // Catch 0s and false too
        if (target[name] !== undefined) {
          // Extend the object if it is an Object
          if (target[name] === Object(target[name])) {
            target[name] = recursiveMerge(target[name], source[name]);
          }
        } else {
          target[name] = source[name];
        }
      });
    }
  });

  return target;
}

function Resource(name, server, options, default_options) {
  this.name = name;
  this.subscribers = {};
  this.server = server; // RadarServer instance
  this.options = recursiveMerge({}, options || {}, default_options || {});
}

MiniEventEmitter.mixin(Resource);
Resource.prototype.type = 'default';

// Add a subscriber (Engine.io socket)
Resource.prototype.subscribe = function(socket, message) {
  this.subscribers[socket.id] = true;
  logging.debug('#'+this.type, '- subscribe', this.name, socket.id,
                              this.subscribers, message && message.ack);

  this.ack(socket, message && message.ack);
};

// Remove a subscriber (Engine.io socket)
Resource.prototype.unsubscribe = function(socket, message) {
  delete this.subscribers[socket.id];

  logging.info('#'+this.type, '- unsubscribe', this.name, socket.id,
                    'subscribers left:', Object.keys(this.subscribers).length);

  if (!Object.keys(this.subscribers).length) {
    logging.info('#'+this.type, '- destroying resource', this.name,
                                          this.subscribers, socket.id);
    this.server.destroyResource(this.name);
  }

  this.ack(socket, message && message.ack);
};

// Send to Engine.io sockets
Resource.prototype.redisIn = function(data) {
  var self = this;
  logging.info('#'+this.type, '- incoming from #redis', this.name, data, 'subs:',
                                          Object.keys(this.subscribers).length );

  Object.keys(this.subscribers).forEach(function(socketId) {
    var socket = self.socketGet(socketId);
    if (socket && socket.send) {
      socket.send(data);
    }
  });
};

// Return a socket reference; eio server hash is "clients", not "sockets"
Resource.prototype.socketGet = function (id) {
  return this.server.socketServer.clients[id];
};

Resource.prototype.ack = function(socket, sendAck) {
  if (socket && socket.send && sendAck) {
    logging.debug('#socket - send_ack', socket.id, this.name, sendAck);

    socket.send({
      op: 'ack',
      value: sendAck
    });
  }
};

Resource.prototype.handleMessage = function(socket, message) {
  switch(message.op) {
    case 'subscribe':
    case 'unsubscribe':
    case 'get':
    case 'sync':
    case 'set':
    case 'publish':
    case 'push':
      this[message.op](socket, message);
      this.emit('message:incoming', message);
      break;
    default:
      logging.error('#resource - Unknown message.op, ignoring', message, socket && socket.id);
  }
};

Resource.prototype.destroy = function() {
};

Resource.setBackend = function(backend) {
  Persistence = backend;
};

module.exports = Resource;
