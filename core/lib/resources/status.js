var Resource = require('../resource.js'),
    Persistence = require('persistence'),
    logger = require('minilog')('radar:status');

var default_options = {
  policy: {
    maxPersistence: 12 * 60 * 60            // 12 hours in seconds
  }
};

function Status(name, parent, options) {
  Resource.call(this, name, parent, options, default_options);
}

Status.prototype = new Resource();
Status.prototype.type = 'status';

// Get status
Status.prototype.get = function(client) {
  var name = this.name;
  logger.debug('#status - get', this.name, (client && client.id));
  this._get(name, function(replies) {
    client.send({
      op: 'get',
      to: name,
      value: replies || {}
    });
  });
};

Status.prototype._get = function(name, callback) {
  Persistence.readHashAll(name, callback);
};

Status.prototype.set = function(client, message) {
  var self = this;
  logger.debug('#status - set', this.name, message, (client && client.id));
  Status.prototype._set(this.name, message, this.options.policy, function() {
    self.ack(client, message.ack);
  });
};

Status.prototype._set = function(scope, message, policy, callback) {
  Persistence.persistHash(scope, message.key, message.value);
  if (policy && policy.maxPersistence) {
    Persistence.expire(scope, policy.maxPersistence);
  } else {
    logger.warn('resource created without ttl :', scope);
    logger.warn('resource policy was :', policy);
  }
  Persistence.publish(scope, message, callback);
};

Status.prototype.sync = function(client) {
  logger.debug('#status - sync', this.name, (client && client.id));
  this.subscribe(client, false);
  this.get(client);
};

Status.setBackend = function(backend) { Persistence = backend; };

module.exports = Status;
