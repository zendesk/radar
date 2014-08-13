var logger = require('minilog')('radar:rest_client'),
    min = Math.pow(36, 5),
    max = Math.pow(36, 6),
    httpRequest = require('request');

function RESTClient(request, response) {
  this.createdAt = Date.now();
  this.request = request;
  this.response = response;
  this.subscriptions = {};
  this.id = 'rest_client-' + Math.floor(Math.random() * (max - min) + min).toString(36);
  response.on('close', this.close.bind(this));
}

RESTClient.get = function(incoming, outgoing) {
  var id = incoming.headers['x-radar-id'], client = RESTClient.clients[id];

  if (!client) {
    client = new RESTClient(incoming, outgoing);
    RESTClient.clients[client.id] = client;
    client.on('close', function() {
      delete RESTClient.clients[client.id];
    });
  }

  return client;
};

RESTClient.clients = {};

require('util').inherits(RESTClient, require('events').EventEmitter);

RESTClient.prototype.id = 'rest_client';
RESTClient.prototype.isRESTClient = true;

RESTClient.prototype.close = function() {
  this.closed = true;
  if (!Object.keys(this.subscriptions).length) {
    this.emit('close');
  }
};

RESTClient.prototype.sendJSON = function(message) {
  logger.debug('#rest_client - sending message', this.id, message, this.closed);

  if (this.subscriptions[message.to]) {
    logger.debug('#rest_client - post to subscription url', this.subscriptions[message.to]);
    message.client = this.id;
    httpRequest.post(
      this.subscriptions[message.to],
      {
        json: message,
        headers: {
          'X-RADAR-ID': this.id
        }
      },
      this._handleSubscriptionResponse.bind(this, message.to)
    );
  } else {
    this.send(JSON.stringify(message));
  }
};

RESTClient.prototype._handleSubscriptionResponse = function(scope, error, response, body) {
  if (error) {
    logger.warn('#webhook - error', error);
  }

  if (error || !body || !body.ack) {
    this.emit('message', JSON.stringify({ to: scope, op: 'unsubscribe' }));
  }
};

RESTClient.prototype.unsubscribe = function(scope) {
  delete this.subscriptions[scope];

  if (!Object.keys(this.subscriptions).length) {
    this.close();
  }
};

RESTClient.prototype.send = function(data) {
  if (!this.closed) {
    this.response.setHeader('Content-Type', 'text/plain'); // IE will otherwise try to save the response instead of just showing it.
    this.response.setHeader('X-RADAR-ID', this.id);
    this.response.end(data);
    this.response.emit('close');
  }
};

RESTClient.prototype.ping = function() {
  this.sendJSON({ pong: 'Radar running' });
};

module.exports = RESTClient;
