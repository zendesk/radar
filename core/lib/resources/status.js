var Resource = require('../resource.js'),
    Persistence = require('../persistence.js');

function Status(name, parent, options) {
  Resource.call(this, name, parent, options);
  this.type = 'status';
}

Status.prototype = new Resource();

// get status
Status.prototype.getStatus = function(client) {
  var self = this;
  Status.prototype._getStatus(this.name, function(replies) {
    client.send(JSON.stringify({
      op: 'get',
      to: self.name,
      value: replies
    }));
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
  Status.prototype._setStatus(this.name, message, function() {
    sendAck && self.ack(client, sendAck);
  });
};

Status.prototype._setStatus = function(scope, message, callback) {
  Persistence.persistHash(scope, message.key, message.value);
  Persistence.publish(scope, JSON.stringify(message), callback);
  Persistence.expire(scope, 12 * 60 * 60); // 12 hours in seconds
};

Status.prototype.sync = function(client) {
  this.subscribe(client, false);
  this.getStatus(client);
};

Status.setBackend = function(backend) { Persistence = backend; };

module.exports = Status;
