var Resource = require('../resource.js'),
    Persistence = require('../persistence.js'),
    logging = require('minilog')('core');

var default_options = {
  policy: {
    maxPersistence: 12 * 60 * 60 // 12 hours in seconds
  }
};

function Status(name, parent, options) {
  Resource.call(this, name, parent, options, default_options);
}

Status.prototype = new Resource();
Status.prototype.type = 'status';

// get status
Status.prototype.get = function(client) {
  var name = this.name;
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
  Status.prototype._set(this.name, message, this.options.policy, function() {
    self.ack(client, message.ack);
  });
};

Status.prototype._set = function(scope, message, policy, callback) {
  Persistence.persistHash(scope, message.key, message.value);
  if(policy && policy.maxPersistence) {
    Persistence.expire(scope, policy.maxPersistence);
  } else {
    logging.warn('resource created without ttl :', scope);
    logging.warn('resource policy was :', policy);
  }
  Persistence.publish(scope, message, callback);
};

Status.prototype.sync = function(client) {
  this.subscribe(client, false);
  this.get(client);
};

Status.setBackend = function(backend) { Persistence = backend; };

module.exports = Status;
