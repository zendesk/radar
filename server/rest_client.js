var logger = require('minilog')('radar:rest_client'),
    min = Math.pow(36, 5),
    max = Math.pow(36, 6);

function RESTClient(request, response) {
  var client = this;
  this.request = request;
  this.response = response;
  this.id = 'rest_client-' + Math.floor(Math.random() * (max - min) + min).toString(36);
  request.on('close', function() {
    if (!client.closed) {
      client.closed = true;
      client.emit('close');
    }
  });
}

require('util').inherits(RESTClient, require('events').EventEmitter);

RESTClient.prototype.id = 'rest_client';

RESTClient.prototype.sendJSON = function(data) {
  logger.info('#client - sending data', this.id, data);
  this.send(JSON.stringify(data));
};

RESTClient.prototype.send = function(data) {
  if (!this.closed) {
    this.response.setHeader('Content-Type', 'text/plain'); // IE will otherwise try to save the response instead of just showing it.
    this.response.end(data);
    this.request.emit('close');
  }
};

RESTClient.prototype.ping = function() {
  this.sendJSON({ pong: 'Radar running' });
};

module.exports = RESTClient;
