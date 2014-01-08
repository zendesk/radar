var assert = require('assert'),
    MiniEE = require('miniee'),
    Persistence = require('../core/lib/persistence.js'),
    Presence = require('../core/lib/resources/presence'),
    logging = require('minilog')('test');

var Server = {
  broadcast: function(subscribers, message) { },
  terminate: function() { },
  destroy: function() {},
  server: {
    clients: { }
  }
};

var counter = 1000,
    oldExpire = Persistence.expire,
    oldPublish = Persistence.publish;

exports['given a presence'] = {

  beforeEach: function(done) {
    this.presence = new Presence('aaa', Server, {});
    this.client = new MiniEE();
    this.client.id = counter++;
    Server.channels = { };
    Server.channels[this.presence.name] = this.presence;
    done();
  },

  afterEach: function(){
    Persistence.expire = oldExpire;
    Persistence.publish = oldPublish;
  },


  'can set status to online and offline': function(done) {
    var presence = this.presence, client = this.client;
    Persistence.publish = function(scope, m) {
      var online = m.online,
          userId = m.userId,
          userType = m.userType;
        assert.equal(1, userId);
        assert.equal(2, userType);
        assert.equal(true, online);
      presence.redisIn(m);
    };

    presence.setStatus(this.client, { key: 1, type: 2, value: 'online' } );

    // also added to _local
    assert.ok(presence._presenceManager.isUserConnected(1));

    Persistence.publish = function(scope, m) {
      var online = m.online,
        userId = m.userId,
        userType = m.userType;
      // immediate notification is sent
      assert.equal(1, userId);
      assert.equal(2, userType);
      assert.equal(false, online);
      presence.redisIn(m);
    };

    presence.setStatus(this.client, { key: 1, type: 2, value: 'offline' } );
    // removed from _local
    assert.ok(!presence._presenceManager.isUserConnected(1));
    done();

  },

  'setting status sets overall expiry to maxPersistence' : function(done) {
    var presence = this.presence, client = this.client;

    Persistence.expire = function(scope, expiry) {
      assert.equal(presence.name, scope);
      assert.equal(expiry, 12 * 60 * 60);
      done();
    }

    presence.setStatus(this.client, { key: 1, type: 2, value: 'online' });
  },

  'autopublish must renew the expiry to maxPersistence' : function(done) {
    var presence = this.presence, client = this.client;

    Persistence.expire = function(scope, expiry) {
      assert.equal(presence.name, scope);
      assert.equal(expiry, 12 * 60 * 60);
      done();
    }

    presence.setStatus(this.client, { key: 1, type: 2, value: 'online' });

  },

  'setting status twice does not cause duplicate notifications': function(done) {
    // see also: presence_monitor.test.js / test with the same name
    var presence = this.presence, client = this.client;
    var calls = 0;
    Persistence.publish = function(scope, m) {
      var online = m.online,
          userId = m.userId,
          userType = m.userType;
      assert.equal(1, userId);
      assert.equal(2, userType);
      assert.equal(true, online);
      presence.redisIn(m);
      calls++;
    };
    presence.setStatus(this.client, { key: 1, type: 2, value: 'online' } );
    presence.setStatus(this.client, { key: 1, type: 2, value: 'online' } );

    assert.equal(1, calls);
    // added to _local ONCE
    assert.ok(presence._presenceManager.isUserConnected(1));
    done();
  },


  'users that disconnect ungracefully are added to the list of waiting items, no duplicates': function(done) {
    this.timeout(17000);

    var presence = this.presence, client = this.client, client2 = new MiniEE();
    client2.id = counter++;

    Persistence.publish = function(scope, m) {
      presence.redisIn(m);
    };

    presence.setStatus(client, { key: 1, type: 2, value: 'online' } );
    presence.unsubscribe(client);

    presence.setStatus(client2, { key: 1, type: 2, value: 'online' } );
    presence.unsubscribe(client2);


    var userOfflineNotifCount = 0;
    var timeout = setTimeout(function() {
      assert.equal(userOfflineNotifCount, 1);
      presence.broadcast = oldBroadCast;
      done();
    }, 16000);

    var oldBroadCast = presence.broadcast;

    presence.broadcast = function() {
      userOfflineNotifCount++
    };
  },

  'when two connections have the same user, a disconnect is only queued after both disconnect but client disconnects are exposed': {

    beforeEach: function() {
      this.client2 = new MiniEE();
      this.client2.id = counter++;

      var self = this;

      this.remote = [];
      this.local = [];

      Persistence.publish = function(scope, data) {
        self.remote.push(data);
        self.presence.redisIn(data);
      };

      this.presence.setStatus(this.client, { key: 1, type: 2, value: 'online' } );
      this.presence.setStatus(this.client2, { key: 1, type: 2, value: 'online' } );

      this.oldBroadcast = this.presence.broadcast;
      this.presence.broadcast = function(data, except) {
        self.oldBroadcast.call(self.presence, data, except);
        self.local.push(data);
      };

      Server.server.clients[this.client.id] = this.client;
      Server.server.clients[this.client2.id] = this.client2;
      this.messages = {};
      this.client.send = function(msg) {
        (self.messages[self.client.id] || (self.messages[self.client.id] = [])).push(msg);
      };
      this.client2.send = function(msg) {
        (self.messages[self.client2.id] || (self.messages[self.client2.id] = [])).push(msg);
      };
    },

    afterEach: function() {
      this.presence.broadcast = this.oldBroadcast;
    },

    'explicit disconnects': function() {
      var presence = this.presence, client = this.client, client2 = this.client2;

      presence.setStatus(this.client, { key: 1, type: 2, value: 'offline' } );

      assert.equal(this.remote.length, 3);
      // a client_offline should be sent for CID 1
      assert.equal(this.remote[0].userId, 1);
      assert.equal(this.remote[0].clientId, client.id);
      assert.equal(this.remote[0].online, true);
      // a autopublish renewal should be sent remotely for UID 1 (CID 2)
      assert.equal(this.remote[1].userId, 1);
      assert.equal(this.remote[1].clientId, client2.id);
      assert.equal(this.remote[1].online, true);

      assert.equal(this.remote[2].userId, 1);
      assert.equal(this.remote[2].clientId, client.id);
      assert.equal(this.remote[2].online, false);

      presence.setStatus(client2, { key: 1, type: 2, value: 'offline' } );

      assert.equal(this.remote.length, 4);
      // there should be a client_offline notification for CID 2
      assert.equal(this.remote[3].userId, 1);
      assert.equal(this.remote[3].clientId, client2.id);
      assert.equal(this.remote[3].online, false);

      // check local broadcast
      assert.equal(this.local.length, 3);
      // there should be a client_offline notification for CID 1
      assert.equal(this.local[0].op, 'client_offline');
      assert.equal(this.local[0].value.userId, 1);
      assert.equal(this.local[0].value.clientId, this.client.id);
      // there should be a client_offline notification for CID 2
      assert.equal(this.local[1].op, 'client_offline');
      assert.equal(this.local[1].value.userId, 1);
      assert.equal(this.local[1].value.clientId, this.client2.id);
      // there should be a broadcast for a offline notification for UID 1
      assert.equal(this.local[2].op, 'offline');
      assert.deepEqual(this.local[2].value, { 1: 2 });

      // each client should have received two messages, since we don't send client_offline
      // notifications to the client itself.
      assert.equal(this.messages[this.client.id].length, 2);
      assert.equal(this.messages[this.client2.id].length, 2);
    },

    'ungraceful disconnects': function(done) {
      this.timeout(16*1000)
      var presence = this.presence, client = this.client, client2 = this.client2;

      presence.unsubscribe(client);
      // and the autopublish runs

      assert.equal(this.remote.length, 3);
      // a client_offline should be sent for CID 1
      assert.equal(this.remote[0].online, true);
      assert.equal(this.remote[0].userId, 1);
      assert.equal(this.remote[0].clientId, client.id);
      // a autopublish renewal should be sent remotely for UID 1 (CID 2)
      assert.equal(this.remote[1].online, true);
      assert.equal(this.remote[1].userId, 1);
      assert.equal(this.remote[1].clientId, client2.id);

      assert.equal(this.remote[2].online, false);
      assert.equal(this.remote[2].userId, 1);
      assert.equal(this.remote[2].clientId, client.id);

      presence.unsubscribe(client2);
      // and the autopublish runs

      assert.equal(this.remote.length, 4);
      // there should be a client_offline notification for CID 2
      assert.equal(this.remote[3].userId, 1);
      assert.equal(this.remote[3].clientId, client2.id);
      assert.equal(this.remote[3].online, false);

      var self = this;

      setTimeout(function() {
        // check local broadcast
        assert.equal(self.local.length, 3, JSON.stringify(self.local));
        // there should be a client_offline notification for CID 1
        assert.equal(self.local[0].op, 'client_offline');
        assert.equal(self.local[0].value.userId, 1);
        assert.equal(self.local[0].value.clientId, self.client.id);
        // there should be a client_offline notification for CID 2
        assert.equal(self.local[1].op, 'client_offline');
        assert.equal(self.local[1].value.userId, 1);
        assert.equal(self.local[1].value.clientId, self.client2.id);
        // there should be a broadcast for a offline notification for UID 1
        assert.equal(self.local[2].op, 'offline');
        assert.deepEqual(self.local[2].value, { 1: 2 });

        // only CID 2 receives any messages
        // = one message for the CID1 disconnect, after which no messages are delivered
        assert.equal(typeof self.messages[self.client.id], 'undefined');
        assert.equal(self.messages[self.client2.id].length, 1);

        done();

      }, 15100);

    },

    'one does a ungraceful disconnect, the other one does a explicit disconnect': function() {
      var presence = this.presence, client = this.client, client2 = this.client2;

      presence.unsubscribe(client);

      assert.equal(this.remote.length, 3);
      assert.equal(this.remote[0].online, true);
      assert.equal(this.remote[0].userId, 1);
      assert.equal(this.remote[0].clientId, client.id);
      // a autopublish renewal should be sent remotely for UID 1 (CID 2)
      assert.equal(this.remote[1].online, true);
      assert.equal(this.remote[1].userId, 1);
      assert.equal(this.remote[1].clientId, client2.id);

      // a client_offline should be sent for CID 1
      assert.equal(this.remote[2].online, false);
      assert.equal(this.remote[2].userId, 1);
      assert.equal(this.remote[2].clientId, client.id);

      presence.setStatus(this.client2, { key: 1, type: 2, value: 'offline' } );

      // check local broadcast
      assert.equal(this.local.length, 3);
      // there should be a client_offline notification for CID 1
      assert.equal(this.local[0].op, 'client_offline');
      assert.equal(this.local[0].value.userId, 1);
      assert.equal(this.local[0].value.clientId, this.client.id);
      // there should be a client_offline notification for CID 2
      assert.equal(this.local[1].op, 'client_offline');
      assert.equal(this.local[1].value.userId, 1);
      assert.equal(this.local[1].value.clientId, this.client2.id);
      // there should be a broadcast for a offline notification for UID 1
      assert.equal(this.local[2].op, 'offline');
      assert.deepEqual(this.local[2].value, { 1: 2 });

      // only CID 2 receives any messages
      // = two messages, one for CID 1 offline and one for UID1 offline
      assert.equal(typeof this.messages[this.client.id], 'undefined');
      assert.equal(this.messages[this.client2.id].length, 2);
    }
  },

  'when a user is on two servers, and goes explicitly offline on one, the other one should remain online': function(done) {
    done();
  },

  'local users are written to Redis periodically': function(done) {
    var presence = this.presence, client = this.client;

    var notifications = [];
    Persistence.publish = function(scope, m) {
      var online = m.online,
          userId = m.userId,
          userType = m.userType;
      notifications.push({ userId: userId, userType: userType, online: online });
    };
    presence.setStatus(client, { key: 1, type: 2, value: 'online' } );

    assert.ok(notifications.length > 0); // ideally, only one message, but given the timeouts() processing >1 is also OK
    assert.equal(1, notifications[0].userId);
    done();
  },

  'users that are queued to disconnect and are still gone are gone, users that reconnect are excluded': function(done) {
    this.timeout(16*1000);

    var presence = this.presence, client = this.client, client2 = new MiniEE();
    client2.id = counter++;

    var remote = [],
      local = [];
    Persistence.publish = function(scope, data) {
      remote.push(data);
      presence.redisIn(data);
    };

    presence.setStatus(client, { key: 1, type: 2, value: 'online' } );

    presence.unsubscribe(client);

    presence.setStatus(client2, { key: 123, type: 0, value: 'online' } );
    presence.unsubscribe(client2);

    // now client 1 reconnects
    presence.setStatus(client, { key: 1, type: 2, value: 'online' } );

    var oldBroadcast = presence.broadcast;
    presence.broadcast = function(data) {
      local.push(data);
    };

    setTimeout(function() {
      // client 1 should emit periodic online and 123 should have emitted offline
      // one autopublish message
      assert.ok(remote.some(function(msg) { return msg.userId == 1 && msg.userType == 2 && msg.online == true; } ));
      // one broadcast of a user offline
      assert.deepEqual(local[0], { to: 'aaa', op: 'offline', value: { '123': 0 } });

      presence.broadcast = oldBroadcast;

      done();

    }, 15050);

  },

  'userData should be stored on an incoming message': function() {
    var persistHash = Persistence.persistHash, called = false;

    Persistence.persistHash = function(name, key, value) {
      called = true;
      assert.deepEqual(value.userData, { test: 1 });
    };

    this.presence.setStatus(this.client, { type: 2, key: 123, value: 'online', userData: { test: 1 } });

    assert.ok(called);
    Persistence.persistHash = persistHash;
  },

  'userData should be included as the value of a client in a presence response': function(done) {
    var self = this;
    var data = {
      clientsCount: 1,
      clients: {},
      userType: 2,
    };

    Persistence.publish = function(scope, data) {
      self.presence.redisIn(data);
    };

    var fakeClient = {
      send: function(msg) {

        assert.ok(msg.value[123]);
        assert.strictEqual(msg.value[123].userType, data.userType);
        assert.deepEqual(msg.value[123].clients, data.clients);
        done();
      }
    };

    data.clients[this.client.id] = { test: 1 };

    this.presence.setStatus(this.client, { type: 2, key: 123, value: 'online', userData: { test: 1 } });
    setTimeout(function() {
      self.presence.getStatus(fakeClient, { options: { version: 2 } });
    }, 50);
  },

  'client_online is sent after a client glitch (short online->offline->online)': function(done) {
    var messagesCount = {};

    var self = this;
    Persistence.publish = function(scope, data) {
      self.presence.redisIn(data);
    };

    function message(id) {
      if(!messagesCount[id]) {
        messagesCount[id] = 1;
      } else {
        messagesCount[id] ++;
      }
    }

    self.presence._presenceManager.on('user_online', function() {
      message('user_online');
    });
    self.presence._presenceManager.on('client_online', function() {
      message('client_online');
    });
    self.presence._presenceManager.on('user_offline', function() {
      message('user_offline');
    });
    self.presence._presenceManager.on('client_offline', function() {
      message('client_offline');
    });

    setTimeout(function() {
      assert.ok(messagesCount['client_online'], "expected client_online event but did not get it");

      assert.ok(messagesCount['user_online'], "expected online event but did not get it");
      assert.ok(messagesCount['user_online'] === 1, "expected [online] event to be received only once");

      assert.ok(messagesCount['client_offline'], "expected client_offline event but did not get it");
      assert.ok(messagesCount['client_offline'] === 1, "expected [client_offline] event to be received only once");

      assert.ok(!messagesCount['user_offline'], "did not expect user_offline event");

      assert.ok(messagesCount['client_online'] === 2, "expected client_online event #2 but did not get it");

      done();
    }, 500);

    self.presence.setStatus(self.client, { type: 2, key: 123, value: 'online', userData: { test: 1 } });

    setTimeout(function() {
      self.presence.unsubscribe(self.client);

      setTimeout(function() {
        self.presence.setStatus(self.client, { type: 2, key: 123, value: 'online', userData: { test: 1 } });
      }, 100);
    }, 100);
  },

  'client loosing connection should not cause user offline (soft offline)': function(done) {
    var self = this;

    Persistence.publish = function(scope, data) {
      self.presence.redisIn(data);
    };

    var expectedClients = {};
    expectedClients[self.client.id] = {};

    var fakeClient = {
      send: function(msg) {
        assert.ok(msg.value[123]); // user is still online
        assert.deepEqual(msg.value[123].clients, {}); // but no client is connected
        done();
      }
    };

    self.presence.setStatus(self.client, { type: 2, key: 123, value: 'online' });
    setTimeout(function() {
      self.presence.unsubscribe(self.client);
      setTimeout(function() {
        self.presence.getStatus(fakeClient, { options: { version: 2 } });
      }, 200);
    }, 200);
  },
};
