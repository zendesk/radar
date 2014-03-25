var Persistence = require('./persistence.js'),
    logging = require('minilog')('core'),
    async = require('async');

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
        if (target[name]) {
          // extend the object if it is an Object
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

function Resource(name, parent, options, default_options) {
  this.name = name;
  this.subscribers = {};
  this.parent = parent;
  this.options = recursiveMerge({}, options || {}, default_options || {});
}

Resource.prototype.type = 'default';

// Add a subscriber (Engine.io client)
Resource.prototype.subscribe = function(client, message) {
  client.subscriptions = client.subscriptions || {};
  client.subscriptions[this.name] = this;
  this.subscribers[client.id] = true;
  logging.debug('#res_subscribe', this.name, client.id, message && message.ack);
  this.ack(client, message && message.ack);
};

// Remove a subscriber (Engine.io client)
Resource.prototype.unsubscribe = function(client, message, done) {
  delete this.subscribers[client.id];

  logging.debug('#res_unsubscribe', this.name, client.id);

  this.ack(client, message && message.ack);

  if (!Object.keys(this.subscribers).length) {
    logging.debug('Destroying resource', this.name, this.subscribers);
    this.parent.destroy(this.name, done);
  } else if (done) {
    setImmediate(done);
  }
};

var noop = function(name) {
  return function() {
    logging.error('#undefined_method called for resource', name, this.name);
  };
};
'get set sync publish'.split(' ').forEach(function(method) {
  Resource.prototype[method] = noop(method);
});

// send to Engine.io clients
Resource.prototype.redisIn = function(data) {
  var self = this;
  logging.debug('#res_in', this.name, data);
  async.eachLimit(Object.keys(this.subscribers), 20, function(subscriber, next) {
    var client = self.parent.server.clients[subscriber];
    if (client && client.send) {
      client.send(data);
    }
    setImmediate(next);
  });
};

Resource.prototype.ack = function(client, sendAck) {
  if (client && client.send && sendAck) {
    logging.debug('#client_send_ack', client.id, sendAck);

    client.send({
      op: 'ack',
      value: sendAck
    });
  }
};

Resource.prototype.authorize = function(message, client) {
  var authProvider = this.options.authProvider;
  if (authProvider && authProvider.authorize) {
    return authProvider.authorize(this.options, message, client);
  }
  return true;
};

Resource.prototype.handleMessage = function(client, message) {
  switch(message.op) {
    case 'subscribe':
    case 'unsubscribe':
    case 'get':
    case 'sync':
    case 'set':
    case 'publish':
      this[message.op](client, message);
      break;
  }
};

Resource.setBackend = function(backend) {
  Persistence = backend;
};

module.exports = Resource;
