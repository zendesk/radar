var Resource = require('../resource.js'),
    Persistence = require('../persistence.js'),
    logging = require('minilog')('core');

var def_options = {
  policy: { maxPersistence: 12 * 60 * 60 } // 12 hours in seconds
};

function Status(name, parent, options) {
  var merged = Resource.apply_defaults(options, def_options);
  Resource.call(this, name, parent, merged);
  this.type = 'status';
}

Status.prototype = new Resource();

// get status
Status.prototype.getStatus = function(client) {
  var self = this;
  Status.prototype._getStatus(this.name, function(replies) {
    client.send({
      op: 'get',
      to: self.name,
      value: replies
    });
  });
};

Status.prototype._getStatus = function(name, callback) {
  Persistence.readHashAll(name, callback);
};

Status.prototype.setStatus = function(client, message, sendAck) {
  var self = this;
  if(arguments.length == 1) {
    message = client; // client and sendAck are optional
  }
  Status.prototype._setStatus(this.name, message, this.options.policy, function() {
    sendAck && self.ack(client, sendAck);
  });
};

Status.prototype._setStatus = function(scope, message, policy, callback) {
  Persistence.persistHash(scope, message.key, message.value);
  if(policy && policy.maxPersistence) {
    Persistence.expire(scope, policy.maxPersistence);
  } else {
    logging.warn("resource created without ttl :"+scope)
    logging.warn("resource policy was :"+JSON.stringify(policy))
  }
  Persistence.publish(scope, message, callback);
};

Status.prototype.sync = function(client) {
  this.subscribe(client, false);
  this.getStatus(client);
};

Status.setBackend = function(backend) { Persistence = backend; };

module.exports = Status;
