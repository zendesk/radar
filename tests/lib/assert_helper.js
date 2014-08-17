var assert = require('assert'),
    EE = require('events').EventEmitter;

//presence helper
function PresenceMessage(account, name) {
  this.scope = 'presence:/'+account+'/'+name;
  this.notifications = [];
  this.times = [];

  var self = this;
  this.notify = function(message) {
    self.notifications.push(message);
    self.times.push(Date.now());
    self.emit(self.notifications.length);
  };
}

require('util').inherits(PresenceMessage, EE);

PresenceMessage.prototype.teardown = function() {
  this.notifications = [];
  this.removeAllListeners();
  delete this.client;
  delete this.online_clients;
};

PresenceMessage.prototype.fail_on_more_than = function(n) {
  this.on(n+1, function() {
    assert.ok(false, 'more than '+n+' messages received');
  });
};

PresenceMessage.prototype.fail_on_any_message = function() {
  this.fail_on_more_than(0);
};

PresenceMessage.prototype.for_client = function(client) {
  this.client = {
    userId: client.configuration('userId'),
    userType:  client.configuration('userType'),
    userData: client.configuration('userData'),
    clientId: client.currentClientId()
  };
  return this;
};

// user online:
// { to: "presence:/<account/<scope>",
//   op: "online",
//   value:{ <user_id> : <user_type> },
//   userData:  <user_data>
// }

PresenceMessage.prototype.assert_online = function(message) {
  var value = {}, client = this.client;
  value[client.userId] = client.userType;

  assert.deepEqual({
    to: this.scope,
    op: 'online',
    value: value,
    userData: client.userData
  }, message);
};
// user offline:
// {
//   to: "presence:/<account>/<scope>",
//   op: "offline",
//   value: { <user_id>:<user_type> }
// }
PresenceMessage.prototype.assert_offline = function(message) {
  var value = {}, client = this.client;
  value[client.userId] = client.userType;

  assert.deepEqual({
    to: this.scope,
    op: 'offline',
    value: value,
  }, message);
};
// client_online:
// {
//   to:"presence:/<account>/<scope>,
//   op:"client_online",
//   value:{
//     userId: <user_id>,
//     clientId: <client_id>,
//     userData: <user_data>
//   }
// }
PresenceMessage.prototype.assert_client_online = function(message) {
  var client = this.client;
  var value = {
    userId: client.userId,
    clientId: client.clientId,
    userData: client.userData
  };

  assert.deepEqual({
    to: this.scope,
    op: 'client_online',
    value: value
  }, message);
};

// client_offline:
// {
//   to:"presence:/<account>/<scope>,
//   op:"client_online",
//   explicit: true,
//   value:{
//     userId: <user_id>,
//     clientId: <client_id>,
//   }
// }
PresenceMessage.prototype.assert_client_offline = function(message, explicit) {
  var client = this.client;
  var value = {
    userId: client.userId,
    clientId: client.clientId
  };

  assert.deepEqual({
    to: this.scope,
    op: 'client_offline',
    explicit: explicit,
    value: value
  }, message);
};

PresenceMessage.prototype.assert_client_explicit_offline =  function(message) {
  this.assert_client_offline(message, true);
};

PresenceMessage.prototype.assert_client_implicit_offline =  function(message) {
  this.assert_client_offline(message, false);
};

PresenceMessage.prototype.assert_message_sequence = function(list) {
  var i, messages = this.notifications;
  assert.equal(messages.length, list.length, 'mismatch '+list+' in messages received : '+JSON.stringify(messages));

  for(i = 0; i < messages.length; i++) {
    var method = 'assert_'+list[i];
    this[method].call(this, messages[i]);
  }
};

PresenceMessage.prototype.for_online_clients = function() {
  var clients = Array.prototype.slice.call(arguments, 0);
  this.online_clients = clients;
  return this;
};

// get response:
// { op:"get",
//   to:"presence:/<account>/<scope>",
//   value: {
//     <user_id>: <user_type>,
//     <user_id>: <user_type>
//   }
//  }
PresenceMessage.prototype.assert_get_response = function(message) {
  clients = this.online_clients || [];
  var value = {};

  clients.forEach(function(client) {
    value[client.configuration('userId')] = client.configuration('userType');
  });

  assert.deepEqual({
    op: 'get',
    to: this.scope,
    value: value
  }, message);
};

//get v2 response:
//{ op:"get",
//  to:"presence:/<account>/<scope>",
//  value: {
//    <user_id>: {
//      clients: {
//        <client_id>: <user_data>,
//        ...
//      },
//      userType: <user_type>
//    },
//   ...
//  }
//}
PresenceMessage.prototype.assert_get_v2_response = function(message) {
  var value = {};
  clients = this.online_clients || [];
  clients.forEach(function(client) {
    var clientId = client.currentClientId();
    var userId = client.configuration('userId');
    var userData = client.configuration('userData');
    var userType = client.configuration('userType');
    var userHash;
    if(value[userId]) {
      userHash = value[userId];
    } else {
      value[userId] = userHash = { clients: {} };
    }
    userHash.clients[clientId] = userData;
    userHash.userType = userType;
  });

  assert.deepEqual({
    op: 'get',
    to: this.scope,
    value: value
  }, message);
};

// sync response:
// { op:"online",
//   to:"presence:/<account>/<scope>",
//   value: {
//     <user_id>: <user_type>,
//     <user_id>: <user_type>
//   }
//  }
PresenceMessage.prototype.assert_sync_response = function(message) {
  clients = this.online_clients || [];
  var value = {};

  clients.forEach(function(client) {
    value[client.configuration('userId')] = client.configuration('userType');
  });

  assert.deepEqual({
    op: 'online',
    to: this.scope,
    value: value
  }, message);
};

//sync v2 response: same as get v2
PresenceMessage.prototype.assert_sync_v2_response = PresenceMessage.prototype.assert_get_v2_response;
// ack format
// { op: 'set/subscribe/unsubscribe',
//   to: 'presence:/<account>/<scope>',
//   ack: <ack number>,
//   userData: <user_data>
//
//   value: <online/offline>, //only for set
//   key: <user_id>, //only for set
//   type: <user_type>, //only for set
// }
PresenceMessage.prototype.assert_ack_for = function(type, message) {
  var expected = { to: this.scope };
  var ackNumber = message.ack;
  delete message.ack;

  switch(type) {
    case 'set_online':
    case 'set_offline':
      expected.op = 'set';
      expected.value = type.split('_')[1];
      expected.key = this.client.userId;
      expected.type = this.client.userType;
      break;
    case 'subscribe':
    case 'unsubscribe':
      expected.op = type;
      break;
  }
  expected.userData = this.client.userData;

  assert.deepEqual(expected, message);
  assert.ok(ackNumber > 0);
  message.ack = ackNumber; //restore
};

PresenceMessage.prototype.assert_ack_for_set_online = function(message) {
  this.assert_ack_for('set_online', message);
};

PresenceMessage.prototype.assert_ack_for_set_offline = function(message) {
  this.assert_ack_for('set_offline', message);
};

PresenceMessage.prototype.assert_ack_for_subscribe = function(message) {
  this.assert_ack_for('subscribe', message);
};

PresenceMessage.prototype.assert_ack_for_unsubscribe = function(message) {
  this.assert_ack_for('unsubscribe', message);
};

//timing of messages
PresenceMessage.prototype.assert_delay_between_notifications_within_range = function(i, j, low, high) {
  var delay;
  delay = this.times[j] - this.times[i];
  assert.ok(low <= delay, 'delay('+delay+') was not >= '+low);
  assert.ok(delay <= high, 'delay('+delay+') was not <= '+high);
};

module.exports.PresenceMessage = PresenceMessage;
