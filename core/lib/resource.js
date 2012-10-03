var Persistence = require('./persistence.js'),
    logging = require('minilog')('core');

/*

Resources
=========

- have a type, one of:

  - have statuses, which are a hash of values. Values never expire by themselves, they are always explicitly set.
  - have messages, which are an ordered set of messages

- can be subscribed to (e.g. pubsub)

- can be synchronized (e.g. read full set of values, possibly applying some filtering), if it is a status or message

*/

function Resource(name, parent, options) {
  this.name = name
  this.subscribers = {};
  this.parent = parent;
  this.type = 'default';
  this.options = options;
}

// Add a subscriber (Engine.io client)
Resource.prototype.subscribe = function(client, sendAck) {
  this.subscribers[client.id] = true;
  logging.debug('#res_subscribe', this.name, client.id, this.subscribers, sendAck);
  sendAck && this.ack(client, sendAck);
};

// Remove a subscriber (Engine.io client)
Resource.prototype.unsubscribe = function(client, sendAck) {
  delete this.subscribers[client.id];
  logging.debug('#res_unsubscribe', this.name, client.id);
  if (Object.keys(this.subscribers).length == 0) {
    logging.debug('Destroying resource', this.name, this.subscribers);
    this.parent.destroy(this.name);
  }
  sendAck && this.ack(client, sendAck);
};

// send to Engine.io clients
Resource.prototype.redisIn = function(data) {
  var self = this;
  logging.debug('#res_in', this.name, this.subscribers, data);
  Object.keys(this.subscribers).forEach(function(subscriber) {
    var client = self.parent.server.clients[subscriber];
    client && client.send(data);
  });
};

Resource.prototype.ack = function(client, sendAck) {
  logging.debug('#client_send_ack', client.id, sendAck);
  client.send(JSON.stringify({
    op: 'ack',
    value: sendAck
  }));
}

Resource.setBackend = function(backend) { Persistence = backend; };

module.exports = Resource;
