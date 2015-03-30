var Persistence = require('persistence'),
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

function Resource(name, parent, options, default_options) {
  this.name = name;
  this.subscribers = {};
  this.parent = parent;
  this.options = recursiveMerge({}, options || {}, default_options || {});
}

Resource.prototype.type = 'default';

// Add a subscriber (Engine.io client)
Resource.prototype.subscribe = function(client, message) {
  this.subscribers[client.id] = true;
  logging.debug('#'+this.type, '- subscribe', this.name, client.id,
                              this.subscribers, message && message.ack);

  this.ack(client, message && message.ack);
};

// Remove a subscriber (Engine.io client)
Resource.prototype.unsubscribe = function(client, message) {
  delete this.subscribers[client.id];

  logging.info('#'+this.type, '- unsubscribe', this.name, client.id,
                    'subscribers left:', Object.keys(this.subscribers).length);

  if (!Object.keys(this.subscribers).length) {
    logging.info('#'+this.type, '- destroying resource', this.name,
                                          this.subscribers, client.id);
    this.parent.destroyResource(this.name);
  }

  this.ack(client, message && message.ack);
};

// Send to Engine.io clients
Resource.prototype.redisIn = function(data) {
  var self = this;
  logging.info('#'+this.type, '- incoming from #redis', this.name, data, 'subs:',
                                          Object.keys(this.subscribers).length );

  Object.keys(this.subscribers).forEach(function(clientId) {
    var client = self.clientGet(clientId);
    if (client && client.send) {
      client.send(data);
    }
  });
};

// Return a client reference
Resource.prototype.clientGet = function (id) {
  return this.parent.server.clients[id];
}

Resource.prototype.ack = function(client, sendAck) {
  if (client && client.send && sendAck) {
    logging.debug('#client - send_ack', client.id, this.name, sendAck);

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
    case 'push':
      this[message.op](client, message);
      break;
    default:
      logging.error('#resource - Unknown message.op, ignoring', message, client && client.id);
  }
};

Resource.prototype.destroy = function() {
};

Resource.setBackend = function(backend) {
  Persistence = backend;
};

module.exports = Resource;
