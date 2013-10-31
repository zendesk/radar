var assert = require('assert'),
    Heartbeat = require('heartbeat'),
    MiniEE = require('miniee'),
    Persistence = require('../core/lib/persistence.js'),
    Presence = require('../core/lib/resources/presence'),
    logging = require('minilog')('test');

var Server = {
  timer: new Heartbeat().interval(1500),
  broadcast: function(subscribers, message) { },
  terminate: function() { Server.timer.clear(); },
  destroy: function() {},
  server: {
    clients: { }
  }
};

Persistence.setConfig({redis_port:27000, redis_host:'localhost'});
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
    Server.timer.clear();
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
    };
    presence.setStatus(this.client, { key: 1, type: 2, value: 'online' } );

    // also added to _local
    assert.ok(presence._xserver.hasUser(1));

    Persistence.publish = function(scope, m) {
      var online = m.online,
          userId = m.userId,
          userType = m.userType;
      // immediate notification is sent
      assert.equal(1, userId);
      assert.equal(2, userType);
      assert.equal(false, online);
    };

    presence.setStatus(this.client, { key: 1, type: 2, value: 'offline' } );
    // removed from _local
    assert.ok(!presence._xserver.hasUser(1));
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

    presence.setStatus(this.client, { key: 1, type: 2, value: 'online' });
    Persistence.expire = function(scope, expiry) {
      assert.equal(presence.name, scope);
      assert.equal(expiry, 12 * 60 * 60);
      done();
    }
    presence._xserver.timeouts();

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
      calls++;
    };
    presence.setStatus(this.client, { key: 1, type: 2, value: 'online' } );
    presence.setStatus(this.client, { key: 1, type: 2, value: 'online' } );

    assert.equal(2, calls); //One for client, one for user
    // added to _local ONCE
    assert.ok(presence._xserver.hasUser(1));
    done();
  },


  'users that disconnect ungracefully are added to the list of waiting items, no duplicates': function(done) {
    var presence = this.presence, client = this.client, client2 = new MiniEE();
    client2.id = counter++;

    Persistence.publish = function(scope, data) { };

    presence.setStatus(this.client, { key: 1, type: 2, value: 'online' } );

    assert.equal(Object.keys(presence._xserver._disconnectQueue._queue).length, 0);
    presence.unsubscribe(client);
    // disconnect is queued
    assert.ok(presence._xserver._disconnectQueue._queue[1]);
    assert.equal(Object.keys(presence._xserver._disconnectQueue._queue).length, 1);

    presence.setStatus(client2, { key: 1, type: 2, value: 'online' } );
    presence.unsubscribe(client2);
    // no duplicates
    assert.ok(presence._xserver._disconnectQueue._queue[1]);
    assert.equal(Object.keys(presence._xserver._disconnectQueue._queue).length, 1);

    done();
  },

  'when two connections have the same user, a disconnect is only queued after both disconnect but client disconnects are exposed': {

    beforeEach: function() {
      this.client2 = new MiniEE();
      this.client2.id = counter++;
      this.presence.setStatus(this.client, { key: 1, type: 2, value: 'online' } );
      this.presence.setStatus(this.client2, { key: 1, type: 2, value: 'online' } );

      var self = this;

      this.remote = [];
      this.local = [];
      Persistence.publish = function(scope, data) {
        self.remote.push(data);
      };

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
      // and the autopublish runs
      presence._xserver.timeouts();
      presence._xserver._processDisconnects();

      assert.equal(this.remote.length, 2);
      // a client_offline should be sent for CID 1
      assert.equal(this.remote[0].userId, 1);
      assert.equal(this.remote[0].clientId, client.id);
      assert.equal(this.remote[0].online, false);
      // a autopublish renewal should be sent remotely for UID 1 (CID 2)
      assert.equal(this.remote[1].userId, 1);
      assert.equal(this.remote[1].clientId, client2.id);
      assert.equal(this.remote[1].online, true);

      presence.setStatus(client2, { key: 1, type: 2, value: 'offline' } );
      // and the autopublish runs
      presence._xserver.timeouts();
      presence._xserver._processDisconnects();

      assert.equal(this.remote.length, 3);
      // there should be a client_offline notification for CID 2
      assert.equal(this.remote[2].userId, 1);
      assert.equal(this.remote[2].clientId, client2.id);
      assert.equal(this.remote[2].online, false);

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

    'ungraceful disconnects': function() {
      var presence = this.presence, client = this.client, client2 = this.client2;

      presence.unsubscribe(client);
      // and the autopublish runs
      presence._xserver.timeouts();
      presence._xserver._processDisconnects();

      assert.equal(this.remote.length, 2);
      // a client_offline should be sent for CID 1
      assert.equal(this.remote[0].online, false);
      assert.equal(this.remote[0].userId, 1);
      assert.equal(this.remote[0].clientId, client.id);
      // a autopublish renewal should be sent remotely for UID 1 (CID 2)
      assert.equal(this.remote[1].online, true);
      assert.equal(this.remote[1].userId, 1);
      assert.equal(this.remote[1].clientId, client2.id);

      presence.unsubscribe(client2);
      // and the autopublish runs
      presence._xserver.timeouts();
      presence._xserver._processDisconnects();

      assert.equal(this.remote.length, 3);
      // there should be a client_offline notification for CID 2
      assert.equal(this.remote[2].userId, 1);
      assert.equal(this.remote[2].clientId, client2.id);
      assert.equal(this.remote[2].online, false);

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
      // = one message for the CID1 disconnect, after which no messages are delivered
      assert.equal(typeof this.messages[this.client.id], 'undefined');
      assert.equal(this.messages[this.client2.id].length, 1);
    },

    'one does a ungraceful disconnect, the other one does a explicit disconnect': function() {
      var presence = this.presence, client = this.client, client2 = this.client2;

      presence.unsubscribe(client);
      // and the autopublish runs
      presence._xserver.timeouts();
      presence._xserver._processDisconnects();

      assert.equal(this.remote.length, 2);
      // a client_offline should be sent for CID 1
      assert.equal(this.remote[0].online, false);
      assert.equal(this.remote[0].userId, 1);
      assert.equal(this.remote[0].clientId, client.id);
      // a autopublish renewal should be sent remotely for UID 1 (CID 2)
      assert.equal(this.remote[1].online, true);
      assert.equal(this.remote[1].userId, 1);
      assert.equal(this.remote[1].clientId, client2.id);

      presence.setStatus(this.client2, { key: 1, type: 2, value: 'offline' } );
      // and the autopublish runs
      presence._xserver.timeouts();
      presence._xserver._processDisconnects();

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
    presence._xserver.timeouts();
    assert.ok(notifications.length > 0); // ideally, only one message, but given the timeouts() processing >1 is also OK
    assert.equal(1, notifications[0].userId);
    done();
  },

  'users that are queued to disconnect and are still gone are gone, users that reconnect are excluded': function() {
    var presence = this.presence, client = this.client, client2 = new MiniEE();
    client2.id = counter++;
    presence.setStatus(client, { key: 1, type: 2, value: 'online' } );

    assert.equal(Object.keys(presence._xserver._disconnectQueue._queue).length, 0);
    presence.unsubscribe(client);
    // disconnect is queued
    assert.equal(Object.keys(presence._xserver._disconnectQueue._queue).length, 1);

    presence.setStatus(client2, { key: 123, type: 0, value: 'online' } );
    presence.unsubscribe(client2);
    // disconnect is queued
    assert.equal(Object.keys(presence._xserver._disconnectQueue._queue).length, 2);

    // now client 1 reconnects
    presence.setStatus(client, { key: 1, type: 2, value: 'online' } );

    var remote = [],
        local = [];
    Persistence.publish = function(scope, data) {
      remote.push(data);
    };
    var oldBroadcast = presence.broadcast;
    presence.broadcast = function(data) {
      local.push(data);
    };
    // and the autopublish runs
    presence._xserver.timeouts();
    presence._xserver._processDisconnects();
    // client 1 should emit periodic online and 123 should have emitted offline
    // one autopublish message
    assert.ok(remote.some(function(msg) { return msg.userId == 1 && msg.userType == 2 && msg.online == true; } ));
    // one broadcast of a user offline
    assert.deepEqual(local[0], { to: 'aaa', op: 'offline', value: { '123': 0 } });

    presence.broadcast = oldBroadcast;
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

  'userData should be included as the value of a client in a presence response': function() {
    var data = {
          clients: {},
          userType: 2,
        },
        fakeClient = {
          send: function(msg) {
            assert.deepEqual(msg.value[123], data);
          }
        };

    data.clients[this.client.id] = { test: 1 };

    this.presence.setStatus(this.client, { type: 2, key: 123, value: 'online', userData: { test: 1 } });
    this.presence.getStatus(fakeClient, { options: { version: 2 } });
  }
};

// if this module is the script being run, then run the tests:
if (module == require.main) {
  var mocha = require('child_process').spawn('mocha', [ '--colors', '--ui', 'exports', '--reporter', 'spec', __filename ]);
  mocha.stdout.pipe(process.stdout);
  mocha.stderr.pipe(process.stderr);
}
