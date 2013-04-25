var Resource = require('../resource.js'),
    Persistence = require('../persistence.js');

var def_options = {
  policy: { maxPersistence: 14 * 24 * 60 * 60 } // 2 weeks in seconds
};
// Every time we use this channel, we prolong expiry to maxPersistence
// This includes even the final unsubscribe, in case a client decides to rejoin
// after being the last user.

function MessageList(name, parent, options) {
  var merged = Resource.apply_defaults(options, def_options);
  Resource.call(this, name, parent, merged);
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
    Persistence.expire(name, policy.maxPersistence);
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
  Persistence.expire(name, policy.maxPersistence);
  Persistence.readOrderedWithScores(name, policy, callback);
};

MessageList.prototype.unsubscribe = function(client, sendAck) {
  Resource.prototype.unsubscribe.call(this, client, sendAck);
  // note that since this is not synchronized across multiple backend servers, it is possible
  // for a channel that is subscribed elsewhere to have a TTL set on it again. The assumption is that the
  // TTL is so long that any normal workflow will terminate before it is triggered.
  if (this.options.policy.cache) {
    Persistence.expire(this.name, this.options.policy.maxPersistence);
  }
};

MessageList.setBackend = function(backend) { Persistence = backend; };

module.exports = MessageList;
