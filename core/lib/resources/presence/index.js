var Resource = require('../../resource.js'),
    logging = require('minilog')('presence');

function Presence(name, parent, options) {
  Resource.call(this, name, parent, options);
  var self = this;
  this.type = 'presence';

  this.counter = new UserCounter();
  this.counter.on('user_online', function(userId) {
    var value = {};
    value[userId] = userType;
    self.broadcast(JSON.stringify({
      to: self.name,
      op: 'online',
      value: value
    });
  });
  this.counter.on('user_offline', function(userId) {
    // here, we set a delay for the check
    setTimeout(function() {
      var value = {};
      if(self.counter.has(userId)) {
        logging.info('Cancel disconnect, as user has reconnected during grace period, userId:', userId);
      } else {
      value[userId] = userType;
      self.broadcast(JSON.stringify({
          to: self.name,
          op: ( online ? 'online' : 'offline'),
          value: value
        });
      }
    }, 15000);
  });
  this.counter.on('client_online', function(clientId, userId) {
    self.broadcast(JSON.stringify({
      to: self.name,
      op: 'client_online',
      value: {
        userId: userId,
        clientId: clientId
      }
    });
  });
  this.counter.on('client_offline', function(clientId, userId) {
    self.broadcast(JSON.stringify({
      to: self.name,
      op: 'client_offline',
      value: {
        userId: userId,
        clientId: clientId
      }
    });
  });
}

Presence.prototype = new Resource();

Presence.prototype.redisIn = function(data) {
  try {
    var message = JSON.parse(data);
  } catch(e) { return; }


  if(message.online) {
    this.counter.add(message.clientId, message.userId);
  } else {
    this.counter.remove(message.clientId, message.userId);
  }
};

Presence.prototype.setStatus = function(client, message, sendAck) {
  if(arguments.length == 1) {
    message = client; // client and sendAck are optional
  }
  var self = this,
      userId = message.key,
      userType = message.type,
      isOnline = (message.value != 'offline');

  if(isOnline) {
    // we use subscribe/unsubscribe to trap the "close" event, so subscribe now
    this.subscribe(client);
    this.counter.add(client.id, userId);
  } else {
    // remove from local
    this.counter.remove(client.id, userId);
  }
  // only local changes get sent externally
  this.sendPresence(userId, userType, client.id, isOnline, function() {
    // send ACK
    sendAck && self.ack(client, sendAck);
  });
};

Presence.prototype.sendPresence = function(userId, userType, clientId, online, callback) {
  if(online) {
    var message = JSON.stringify({ userId: userId, userType: userType, clientId: clientId, online: true, at: new Date().getTime()});
    Persistence.persistHash(this.scope, userId, message);
    Persistence.publish(this.scope, message, callback);
  } else {
    Persistence.deleteHash(this.scope, userId);
    Persistence.publish(this.scope, JSON.stringify({ userId: userId, userType: userType, clientId: clientId, online: false, at: 0}), callback);
  }
};


Presence.prototype.unsubscribe = function(client, sendAck) {
  // remove from local - if in local at all
  this.local.remove(client.id);
  // garbage collect if the set of subscribers is empty
  if (Object.keys(this.subscribers).length == 1) {
    this.counter = null;
  }
  // call parent
  Resource.prototype.unsubscribe.call(this, client, sendAck);
};

Presence.prototype.sync = function(client) {
  var self = this;
  this.fullRead(function(online) {
    client.send(JSON.stringify({
      op: 'online',
      to: self.name,
      value: online
    }));
  });
};

// this is a full sync of the online status from Redis
Presence.prototype.getStatus = function(client, key) {
  var self = this;
  this.fullRead(function(online) {
    client.send(JSON.stringify({
      op: 'get',
      to: self.name,
      value: online
    }));
  });
};

Presence.prototype.broadcast = function(message) {
  logging.debug('updateSubscribers', message);
  var self = this;
  Object.keys(this.subscribers).forEach(function(subscriber) {
    var client = self.parent.server.clients[subscriber];
    client && client.send(message);
  });
};

Presence.prototype.fullRead = function(callback) {
  var self = this;
  // sync scope presence
  logging.debug('Persistence.readHashAll', this.scope);
  Persistence.readHashAll(this.scope, function(replies) {
    var changeOnline = {},
        changeOffline = {},
        maxAge = new Date().getTime() - 45 * 1000;
    logging.debug(self.scope, 'REPLIES', replies);

    if(!replies) {
      return callback && callback({});
    }

    // process all messages in one go before updating subscribers to avoid
    // sending multiple messages
    Object.keys(replies).forEach(function(key) {
      var data = replies[key];
      try {
        var message = JSON.parse(data);
        if(message.constructor !== Object) {
          throw new Error('JSON parse result is not an Object');
        }
      } catch(err) {
        logging.error('Persistence full read: invalid message', data, err);
        return callback && callback({});
      }
      var isOnline = message.online,
          isExpired = (message.at < maxAge),
          keyName = message.userId + '.' + message.clientId;
      logging.info(message, (isExpired ? 'EXPIRED! ' +(message.at - new Date().getTime())/ 1000 + ' seconds ago'  : ''));
      // reminder: there may be multiple online/offline transitions. We want to replay the
      // history here.
      if(isOnline && !isExpired) {
        changeOnline[keyName] = message;
        delete changeOffline[keyName];
      } else if(!isOnline || (isOnline && isExpired)) {
        changeOffline[keyName] = message;
        delete changeOnline[keyName];
      }
    });

    Object.keys(changeOffline).forEach(function(key) {
      var value = changeOffline[key];
      self.counter.remove(value.clientId, value.userId);
    });
    Object.keys(changeOnline).forEach(function(key) {
      var value = changeOnline[key];
      self.counter.add(value.clientId, value.userId);
    });

    logging.info('fullRead changes - offline', changeOffline, ' online', changeOnline, 'result', self.counter);

    callback && callback(self.counter.items());
  });
};


Presence.setBackend = function(backend) { Persistence = backend; };

module.exports = Presence;
