var assert = require('assert'),
    Heartbeat = require('../core/lib/Heartbeat.js'),
    MiniEE = require('miniee'),
    Persistence = require('persistence'),
    Common = require('./common.js'),
    Presence = require('../core/lib/resources/presence');

describe('given a presence resource',function() {
  var presence, client, client2,
      counter    = 1000,
      oldExpire  = Persistence.expire,
      oldPublish = Persistence.publish;

  var Server = {
    timer: new Heartbeat().interval(1500),
    broadcast: function() { },
    terminate: function() { Server.timer.clear(); },
    destroy: function() {},
    server: {
      clients: { }
    }
  };

  before(function(done){
    Common.startPersistence(done);
  });

  beforeEach(function(done) {
    Persistence.delWildCard('*', function() {
      presence = new Presence('aaa', Server, {});
      client = new MiniEE();
      client.id = counter++;
      client2 = new MiniEE();
      client2.id = counter++;
      Server.channels = { };
      Server.channels[presence.name] = presence;
      Server.timer.clear();
      done();
    });
  });

  afterEach(function(){
    Persistence.expire = oldExpire;
    Persistence.publish = oldPublish;
  });

  after(function(done) {
    Common.endPersistence(done);
  });

  describe('.set', function() {
    it('can be set online', function() {
      var published;
      Persistence.publish = function(scope, m) {
        assert.equal(1, m.userId);
        assert.equal(2, m.userType);
        assert.equal(true, m.online);
        published = true;
      };
      presence.set(client, { key: 1, type: 2, value: 'online' } );
      // also added to _local
      assert.ok(presence._xserver.hasUser(1));
      assert.ok(published);
    });

    it('can be set offline', function() {
      var published;
      Persistence.publish = function(scope, m) {
        assert.equal(1, m.userId);
        assert.equal(2, m.userType);
        assert.equal(true, m.online);
        published = true;
      };
      presence.set(client, { key: 1, type: 2, value: 'online' } );
      // also added to _local
      assert.ok(presence._xserver.hasUser(1));
      assert.ok(published);
    });

    it('expires within maxPersistence if set' , function(done) {
      Persistence.expire = function(scope, expiry) {
        assert.equal(presence.name, scope);
        assert.equal(expiry, 12 * 60 * 60);
        done();
      };

      presence.set(client, { key: 1, type: 2, value: 'online' });
    });

    it('also subscribes, if set online', function() {
      presence.set(client, { key: 1, type: 2, value: 'online' });
      assert.ok(presence.subscribers[client.id]);
    });
  });


  it('autopublish must renew the expiry to maxPersistence' , function(done) {

    presence.set(client, { key: 1, type: 2, value: 'online' });
    Persistence.expire = function(scope, expiry) {
      assert.equal(presence.name, scope);
      assert.equal(expiry, 12 * 60 * 60);
      done();
    };
    presence._xserver.timeouts();
  });

  it('setting status twice does not cause duplicate notifications', function(done) {
    // see also: presence_monitor.test.js / test with the same name
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
    presence.set(client, { key: 1, type: 2, value: 'online' } );
    presence.set(client, { key: 1, type: 2, value: 'online' } );

    assert.equal(2, calls); //One for client, one for user
    // added to _local ONCE
    assert.ok(presence._xserver.hasUser(1));
    done();
  });


  it('users that disconnect implicitly are added to the list of waiting items, no duplicates', function(done) {

    Persistence.publish = function() { };

    presence.set(client, { key: 1, type: 2, value: 'online' } );

    assert.equal(Object.keys(presence._xserver._disconnectQueue._queue).length, 0);
    presence.unsubscribe(client);
    // disconnect is queued
    assert.ok(presence._xserver._disconnectQueue._queue[1]);
    assert.equal(Object.keys(presence._xserver._disconnectQueue._queue).length, 1);

    presence.set(client2, { key: 1, type: 2, value: 'online' } );
    presence.unsubscribe(client2);
    // no duplicates
    assert.ok(presence._xserver._disconnectQueue._queue[1]);
    assert.equal(Object.keys(presence._xserver._disconnectQueue._queue).length, 1);

    done();
  });

  describe('when two connections have the same user, a disconnect is only queued after both disconnect but client disconnects are exposed',function() {
    var remote, local, oldBroadcast, messages;

    beforeEach(function() {
      presence.set(client, { key: 1, type: 2, value: 'online' } );
      presence.set(client2, { key: 1, type: 2, value: 'online' } );

      remote = [];
      local = [];
      Persistence.publish = function(scope, data) {
        remote.push(data);
      };

      oldBroadcast = presence.broadcast;
      presence.broadcast = function(data, except) {
        oldBroadcast.call(presence, data, except);
        local.push(data);
      };

      Server.server.clients[client.id] = client;
      Server.server.clients[client2.id] = client2;
      messages = {};
      client.send = function(msg) {
        (messages[client.id] || (messages[client.id] = [])).push(msg);
      };
      client2.send = function(msg) {
        (messages[client2.id] || (messages[client2.id] = [])).push(msg);
      };
    });

    afterEach(function() {
      presence.broadcast = oldBroadcast;
    });

    it('explicit disconnects', function() {
      presence.set(client, { key: 1, type: 2, value: 'offline' } );
      // and the autopublish runs
      presence._xserver.timeouts();
      presence._xserver._processDisconnects();

      assert.equal(remote.length, 2);
      // a client_offline should be sent for CID 1
      assert.equal(remote[0].userId, 1);
      assert.equal(remote[0].clientId, client.id);
      assert.equal(remote[0].online, false);
      // a autopublish renewal should be sent remotely for UID 1 (CID 2)
      assert.equal(remote[1].userId, 1);
      assert.equal(remote[1].clientId, client2.id);
      assert.equal(remote[1].online, true);

      presence.set(client2, { key: 1, type: 2, value: 'offline' } );
      // and the autopublish runs
      presence._xserver.timeouts();
      presence._xserver._processDisconnects();

      assert.equal(remote.length, 3);
      // there should be a client_offline notification for CID 2
      assert.equal(remote[2].userId, 1);
      assert.equal(remote[2].clientId, client2.id);
      assert.equal(remote[2].online, false);

      // check local broadcast
      assert.equal(local.length, 3);
      // there should be a client_offline notification for CID 1
      assert.equal(local[0].op, 'client_offline');
      assert.equal(local[0].value.userId, 1);
      assert.equal(local[0].value.clientId, client.id);
      // there should be a client_offline notification for CID 2
      assert.equal(local[1].op, 'client_offline');
      assert.equal(local[1].value.userId, 1);
      assert.equal(local[1].value.clientId, client2.id);
      // there should be a broadcast for a offline notification for UID 1
      assert.equal(local[2].op, 'offline');
      assert.deepEqual(local[2].value, { 1: 2 });

      // each client should have received two messages, since we don't send client_offline
      // notifications to the client itself.
      assert.equal(messages[client.id].length, 2);
      assert.equal(messages[client2.id].length, 2);
    });

    it('implicit disconnects', function() {

      presence.unsubscribe(client);
      // and the autopublish runs
      presence._xserver.timeouts();
      presence._xserver._processDisconnects();

      assert.equal(remote.length, 2);
      // a client_offline should be sent for CID 1
      assert.equal(remote[0].online, false);
      assert.equal(remote[0].userId, 1);
      assert.equal(remote[0].clientId, client.id);
      // a autopublish renewal should be sent remotely for UID 1 (CID 2)
      assert.equal(remote[1].online, true);
      assert.equal(remote[1].userId, 1);
      assert.equal(remote[1].clientId, client2.id);

      presence.unsubscribe(client2);
      // and the autopublish runs
      presence._xserver.timeouts();
      presence._xserver._processDisconnects();

      assert.equal(remote.length, 3);
      // there should be a client_offline notification for CID 2
      assert.equal(remote[2].userId, 1);
      assert.equal(remote[2].clientId, client2.id);
      assert.equal(remote[2].online, false);

      // check local broadcast
      assert.equal(local.length, 3);
      // there should be a client_offline notification for CID 1
      assert.equal(local[0].op, 'client_offline');
      assert.equal(local[0].value.userId, 1);
      assert.equal(local[0].value.clientId, client.id);
      // there should be a client_offline notification for CID 2
      assert.equal(local[1].op, 'client_offline');
      assert.equal(local[1].value.userId, 1);
      assert.equal(local[1].value.clientId, client2.id);
      // there should be a broadcast for a offline notification for UID 1
      assert.equal(local[2].op, 'offline');
      assert.deepEqual(local[2].value, { 1: 2 });

      // only CID 2 receives any messages
      // = one message for the CID1 disconnect, after which no messages are delivered
      assert.equal(typeof messages[client.id], 'undefined');
      assert.equal(messages[client2.id].length, 1);
    });

    it('one does an implicit disconnect, the other one does a explicit disconnect', function() {

      presence.unsubscribe(client);
      // and the autopublish runs
      presence._xserver.timeouts();
      presence._xserver._processDisconnects();

      assert.equal(remote.length, 2);
      // a client_offline should be sent for CID 1
      assert.equal(remote[0].online, false);
      assert.equal(remote[0].userId, 1);
      assert.equal(remote[0].clientId, client.id);
      // a autopublish renewal should be sent remotely for UID 1 (CID 2)
      assert.equal(remote[1].online, true);
      assert.equal(remote[1].userId, 1);
      assert.equal(remote[1].clientId, client2.id);

      presence.set(client2, { key: 1, type: 2, value: 'offline' } );
      // and the autopublish runs
      presence._xserver.timeouts();
      presence._xserver._processDisconnects();

      // check local broadcast
      assert.equal(local.length, 3);
      // there should be a client_offline notification for CID 1
      assert.equal(local[0].op, 'client_offline');
      assert.equal(local[0].value.userId, 1);
      assert.equal(local[0].value.clientId, client.id);
      // there should be a client_offline notification for CID 2
      assert.equal(local[1].op, 'client_offline');
      assert.equal(local[1].value.userId, 1);
      assert.equal(local[1].value.clientId, client2.id);
      // there should be a broadcast for a offline notification for UID 1
      assert.equal(local[2].op, 'offline');
      assert.deepEqual(local[2].value, { 1: 2 });

      // only CID 2 receives any messages
      // = two messages, one for CID 1 offline and one for UID1 offline
      assert.equal(typeof messages[client.id], 'undefined');
      assert.equal(messages[client2.id].length, 2);
    });
  });

  it('local users are written to Redis periodically', function(done) {

    var notifications = [];
    Persistence.publish = function(scope, m) {
      var online = m.online,
          userId = m.userId,
          userType = m.userType;
      notifications.push({ userId: userId, userType: userType, online: online });
    };
    presence.set(client, { key: 1, type: 2, value: 'online' } );
    presence._xserver.timeouts();
    assert.ok(notifications.length > 0); // ideally, only one message, but given the timeouts() processing >1 is also OK
    assert.equal(1, notifications[0].userId);
    done();
  });

  it('users that are queued to disconnect and are still gone are gone, users that reconnect are excluded', function() {
    presence.set(client, { key: 1, type: 2, value: 'online' } );

    assert.equal(Object.keys(presence._xserver._disconnectQueue._queue).length, 0);
    presence.unsubscribe(client);
    // disconnect is queued
    assert.equal(Object.keys(presence._xserver._disconnectQueue._queue).length, 1);

    presence.set(client2, { key: 123, type: 0, value: 'online' } );
    presence.unsubscribe(client2);
    // disconnect is queued
    assert.equal(Object.keys(presence._xserver._disconnectQueue._queue).length, 2);

    // now client 1 reconnects
    presence.set(client, { key: 1, type: 2, value: 'online' } );

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
    assert.ok(remote.some(function(msg) { return msg.userId == 1 && msg.userType == 2 && msg.online; } ));
    // one broadcast of a user offline
    assert.deepEqual(local[0], { to: 'aaa', op: 'offline', value: { '123': 0 } });

    presence.broadcast = oldBroadcast;
  });

  it('userData should be stored on an incoming message', function() {
    var persistHash = Persistence.persistHash, called = false;

    Persistence.persistHash = function(name, key, value) {
      called = true;
      assert.deepEqual(value.userData, { test: 1 });
    };

    presence.set(client, { type: 2, key: 123, value: 'online', userData: { test: 1 } });

    assert.ok(called);
    Persistence.persistHash = persistHash;
  });

  it('userData should be included as the value of a client in a presence response', function() {
    var data = {
          clients: {},
          userType: 2,
        },
        fakeClient = {
          send: function(msg) {
            assert.deepEqual(msg.value[123], data);
          }
        };

    data.clients[client.id] = { test: 1 };

    presence.set(client, { type: 2, key: 123, value: 'online', userData: { test: 1 } });
    presence.get(fakeClient, { options: { version: 2 } });
  });
});
