var Set = require('../map.js'),
    Resource = require('../resource.js'),
    Persistence = require('../persistence.js'),
    PresenceMonitor = require('../presence_monitor.js');
    logging = require('minilog')('presence');

function Presence(name, parent, options) {
  Resource.call(this, name, parent, options);
  var self = this;
  this.type = 'presence';
  this.monitor = new PresenceMonitor(this.name);
  this.monitor.on('user_added', function(userId, userType) {
    self.updateSubscribers(userId, userType, true);
  });

  this.monitor.on('user_removed', function(userId, userType) {
    self.updateSubscribers(userId, userType, false);
  });

  this.callback = false;
  // local represents the set of locally connected users that are online
  // key = userId, value = { userType: userType, refs: reference count }
  this._local = new Set();
  // client to userId mapping
  // key = clientId, value = userId
  this._localClients = new Set();
}

Presence.prototype = new Resource();

Presence.prototype.redisIn = function(data) {
  try {
    var message = JSON.parse(data);
  } catch(e) { return; }
  this.monitor.redisIn(message);
};

// when a status is set to online, we subscribe to the close event
// on the client and set back to offline when the connection closes
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
    // set to online
    this.monitor.set(userId, userType, true, function() {
      sendAck && self.ack(client, sendAck);
    });
    // get the clientId to userId map
    var users = this._localClients.get(client.id) || [];
    // add to _local
    if(!this._local.has(userId)) {
      logging.debug('_local set', userId, { userType: userType, refs: 1 });
      this._local.add(userId, { userType: userType, refs: 1 });
    } else {
      // Reference count should only be incremented when the client is
      // not previously known. In other words, if a particular client mistakenly does a double subscribe,
      // they should only be counted once.
      if(users.indexOf(userId) == -1 ) {
        var prev = this._local.get(userId);
        prev.userType = userType;
        prev.refs++;
        logging.debug('_local set', userId, prev);
        this._local.add(userId, prev);
      }
    }
    // add client to userId mapping
    if(users.indexOf(userId) == -1 ) {
      users.push(userId);
      this._localClients.add(client.id, users);
    }
    logging.debug('_local now', this._local, this._localClients);
  } else {
    // remove from _local and unbind from close
    var prev = this._local.get(userId),
        isSet = prev && prev.refs,
        isImmediate = !isSet || (prev.refs <= 1);
    if(isSet) {
      prev.refs--;
      logging.debug('_local set', userId, prev);
      this._local.add(userId, prev);
    }

    if(isImmediate) {
      if(isSet && prev.refs == 0) {
        this._local.remove(userId);
      }
      // only send a notification if there are no other clients interested in this status
      this.monitor.set(userId, userType, false, function() {
        sendAck && self.ack(client, sendAck);
      });
    } else {
      // send ack, even if this is a NOP since some other client is keeping this presence
      sendAck && self.ack(client, sendAck);
    }
  }
  // add parent callback
  if(!this.callback) {
    this.callback = function() { self._autoPublish() };
    this.parent.timer.add(this.callback);
  }
};

Presence.prototype.unsubscribe = function(client, sendAck) {
  var self = this;
  // "close" event has occurred
  if(this._localClients.has(client.id)) {
    this._localClients.get(client.id).forEach(function(userId) {
      var user = self._local.get(userId);
      logging.debug('check disconnect', self.name, userId, user);
      // decrement the ref counter
      if(!user || !user.refs) {
        return;
      }
      if(user.refs) {
        if(user.refs == 1) {
          // NOTE: do not modify user.refs here! Otherwise, we will decrement twice (once here and once when the real disconnect happens)
          // do an actual disconnect only if there are no connections that refer to this user
          self.parent.presenceMaintainer.queue(self.name, userId, user.userType);
          self._local.remove(userId);
        } else {
          // instead of disconnecting, just decrement the ref counter
          user.refs--;
        }
      }
    });
  }
  // remove parent callback if empty
  if (Object.keys(this.subscribers).length == 1) {
    this.parent.timer.remove(this.callback);
    this.callback = false;
  }
  // call parent
  Resource.prototype.unsubscribe.call(this, client, sendAck);
};

Presence.prototype.sync = function(client) {
  var self = this;
  this.monitor.fullRead(function(online) {
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
  this.monitor.fullRead(function(online) {
    client.send(JSON.stringify({
      op: 'get',
      to: self.name,
      value: online
    }));
  });
};

Presence.prototype.updateSubscribers = function(userId, userType, online) {
  logging.debug('updateSubscribers', userId, userType, online);
  var self = this,
      value = {};
  value[userId] = userType;
  var message = JSON.stringify({
      to: self.name,
      op: ( online ? 'online' : 'offline'),
      value: value
  });
  Object.keys(this.subscribers).forEach(function(subscriber) {
    var client = self.parent.server.clients[subscriber];
    client && client.send(message);
  });
};

// Automatically publish online messages
Presence.prototype._autoPublish = function() {
  var self = this;
  logging.debug('_autoPublish', this.name, this._local);

  var now = new Date().getTime();
  this._local.forEach(function(userId) {
    var user = self._local.get(userId);
    logging.debug('Autopub - set online', 'userId:', userId);
    self.monitor.set(parseInt(userId, 10), user.userType, true);
  });

  // if we have nothing worth doing, then do nothing
  if(this._local.length == 0 && this.callback) {
    // remove parent callback
    this.parent.timer.remove(this.callback);
    this.callback = false;
  }
};

Presence.setBackend = function(backend) { Persistence = backend; };

module.exports = Presence;
