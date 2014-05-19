var Resource = require('../resource.js'),
    Persistence = require('persistence'),
    logger = require('minilog')('radar:message_list');

var default_options = {
  policy: {
    maxPersistence: 14 * 24 * 60 * 60 // 2 weeks in seconds
  }
};
// Every time we use this channel, we prolong expiry to maxPersistence
// This includes even the final unsubscribe, in case a client decides to rejoin
// after being the last user.

function MessageList(name, parent, options) {
  Resource.call(this, name, parent, options, default_options);
}

MessageList.prototype = new Resource();
MessageList.prototype.type = 'message';

// Publish to Redis
MessageList.prototype.publish = function(client, message) {
  var self = this;
  this._publish(this.name, this.options.policy, message, function() {
    self.ack(client, message.ack);
  });
};

MessageList.prototype._publish = function(name, policy, message, callback) {
  logger.debug('_publish', name, policy, message);
  if(policy && policy.cache) {
    Persistence.persistOrdered(name, message);
    if(policy.maxPersistence) {
      Persistence.expire(name, policy.maxPersistence);
    }
  }
  Persistence.publish(name, message, callback);
};

MessageList.prototype.sync = function(client, message) {
  var name = this.name;
  this._sync(name, this.options.policy, function(replies) {
    client.send({
      op: 'sync',
      to: name,
      value: replies,
      time: Date.now()
    });
  });
  this.subscribe(client, message);
};

MessageList.prototype._sync = function(name, policy, callback) {
  if(policy && policy.maxPersistence) {
    Persistence.expire(name, policy.maxPersistence);
  }
  Persistence.readOrderedWithScores(name, policy, callback);
};

MessageList.prototype.unsubscribe = function(client, message) {
  Resource.prototype.unsubscribe.call(this, client, message);
  // note that since this is not synchronized across multiple backend servers, it is possible
  // for a channel that is subscribed elsewhere to have a TTL set on it again. The assumption is that the
  // TTL is so long that any normal workflow will terminate before it is triggered.
  if (this.options && this.options.policy && this.options.policy.cache && this.options.policy.maxPersistence) {
    Persistence.expire(this.name, this.options.policy.maxPersistence);
  }
};

MessageList.setBackend = function(backend) { Persistence = backend; };

module.exports = MessageList;
