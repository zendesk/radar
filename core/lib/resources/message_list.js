var Resource = require('../resource.js'),
    Persistence = require('../persistence.js');

function MessageList(name, parent, options) {
  Resource.call(this, name, parent, options);
  this.type = 'message';
}

MessageList.prototype = new Resource();

// Publish to Redis
MessageList.prototype.publish = function(client, message, sendAck) {
  var self = this;
  if(arguments.length == 1) {
    message = client; // client and sendAck are optional
  }
  MessageList.prototype._publish(this.name, this.options.policy, message, function() {
    sendAck && self.ack(client, sendAck);
  });
};

MessageList.prototype._publish = function(name, policy, message, callback) {
  if(policy && policy.cache) {
    Persistence.persistOrdered(name, JSON.stringify(message));
  }
  Persistence.publish(name, JSON.stringify(message), callback);
};

MessageList.prototype.sync = function(client) {
  var self = this;
  MessageList.prototype._sync(this.name, this.options.policy, function(replies) {
    client.send(JSON.stringify({
      op: 'sync',
      to: self.name,
      value: replies,
      time: new Date().getTime()
    }));
  });
};

MessageList.prototype._sync = function(name, policy, callback) {
  Persistence.readOrderedWithScores(name, policy, callback);
};

MessageList.setBackend = function(backend) { Persistence = backend; };

module.exports = MessageList;
