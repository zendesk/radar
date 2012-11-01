var assert = require('assert'),

    Heartbeat = require('heartbeat'),
    MiniEE = require('miniee'),

    Persistence = require('../../lib/persistence.js'),
    Presence = require('../../lib/resources/presence'),
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

var counter = 1000,
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

  after: function(){
    Persistence.publish = oldPublish;
  },

  'can set status to online and offline': function(done) {
    var presence = this.presence, client = this.client;
    Persistence.publish = function(scope, data) {
      var m = JSON.parse(data),
          online = m.online,
          userId = m.userId,
          userType = m.userType;
        assert.equal(1, userId);
// FIXME        assert.equal(2, userType);
        assert.equal(true, online);
    };
    presence.setStatus(this.client, { key: 1, type: 2, value: 'online' } );

    // also added to _local
    assert.ok(presence._xserver.hasUser(1));

    Persistence.publish = function(scope, data) {
      var m = JSON.parse(data),
          online = m.online,
          userId = m.userId,
          userType = m.userType;
      // immediate notification is sent
      assert.equal(1, userId);
// FIXME      assert.equal(2, userType);
      assert.equal(false, online);
    };

    presence.setStatus(this.client, { key: 1, type: 2, value: 'offline' } );
    // removed from _local
    assert.ok(!presence._xserver.hasUser(1));
    done();
  },

  'setting status twice does not cause duplicate notifications': function(done) {
    // see also: presence_monitor.test.js / test with the same name
    var presence = this.presence, client = this.client;
    var calls = 0;
    Persistence.publish = function(scope, data) {
      var m = JSON.parse(data),
          online = m.online,
          userId = m.userId,
          userType = m.userType;
      assert.equal(1, userId);
// FIXME      assert.equal(2, userType);
      assert.equal(true, online);
      calls++;
    };
    presence.setStatus(this.client, { key: 1, type: 2, value: 'online' } );
    presence.setStatus(this.client, { key: 1, type: 2, value: 'online' } );

    assert.equal(2, calls);
    // added to _local ONCE
    assert.ok(presence._xserver.hasUser(1));
    done();
  },


  'users that disconnect ungracefully are added to the list of waiting items, no duplicates': function(done) {
    var presence = this.presence, client = this.client, client2 = new MiniEE();
    client2.id = counter++;
    presence.setStatus(this.client, { key: 1, type: 2, value: 'online' } );

    assert.equal(presence._disconnectQueue.length, 0);
    presence.unsubscribe(client);
    // disconnect is queued
    assert.ok(presence._disconnectQueue.indexOf(1) > -1);
    assert.equal(presence._disconnectQueue.length, 1);

    presence.setStatus(client2, { key: 1, type: 2, value: 'online' } );
    presence.unsubscribe(client2);
    // no duplicates
    assert.ok(presence._disconnectQueue.indexOf(1) > -1);
    assert.equal(presence._disconnectQueue.length, 1);

    done();
  },

  'when two connections have the same user, a disconnect is only queued after both disconnect but client disconnects are exposed': {

    beforeEach: function(done) {
      this.client2 = new MiniEE();
      this.client2.id = counter++;
      this.presence.setStatus(this.client, { key: 1, type: 2, value: 'online' } );
      this.presence.setStatus(this.client2, { key: 1, type: 2, value: 'online' } );

      var self = this;
      this.notifications = [];
      Persistence.publish = function(scope, data) {
        var m = JSON.parse(data),
            online = m.online,
            userId = m.userId,
            userType = m.userType;
        self.notifications.push({ userId: userId, userType: userType, online: online });
      };

      Server.server.clients[this.client.id] = this.client;
      Server.server.clients[this.client2.id] = this.client2;
      this.messages = {};
      this.client.send = function(json) {
        (self.messages[self.client.id] || (self.messages[self.client.id] = [])).push(JSON.parse(json));
      };
      this.client2.send = function(json) {
        (self.messages[self.client2.id] || (self.messages[self.client2.id] = [])).push(JSON.parse(json));
      };
      done();
    },

    'explicit disconnects': function(done) {
      var presence = this.presence, client = this.client, client2 = this.client2;

      presence.setStatus(this.client, { key: 1, type: 2, value: 'offline' } );
      // and the autopublish runs
      presence._autoPublish();
      // there should be one notification - the autopublish renewal
      assert.equal(1, this.notifications.length);
      assert.deepEqual({ userId: 1, userType: 2, online: true}, this.notifications[0]);

      presence.setStatus(client2, { key: 1, type: 2, value: 'offline' } );
      // there should be a disconnect notification
      assert.equal(2, this.notifications.length);
      assert.deepEqual({ userId: 1, userType: 2, online: false}, this.notifications[1]);
      // there should be a client_offline message for client 1
      assert.deepEqual(this.messages[this.client2.id], [ { to: 'aaa',
      op: 'client_offline',
      value: {
        userId: 1,
        userType: 2,
        clientId: this.client.id
      }} ]);

      done();
    },

    'ungraceful disconnects': function(done) {
      var presence = this.presence, client = this.client, client2 = this.client2;

      presence.unsubscribe(client);
      // and the autopublish runs
      presence._autoPublish();
      Server.presenceMaintainer.timer();
      // there should be one notification - the autopublish renewal
      assert.equal(1, this.notifications.length);
      assert.deepEqual({ userId: 1, userType: 2, online: true}, this.notifications[0]);

      presence.unsubscribe(client2);
      // and the autopublish runs
      presence._autoPublish();
      Server.presenceMaintainer.timer();
      logging.info(this.notifications);
      // there should be a disconnect notification
      assert.equal(2, this.notifications.length);
      assert.deepEqual({ userId: 1, userType: 2, online: false}, this.notifications[1]);
      // there should be a client_offline message for client 1
      assert.deepEqual(this.messages[this.client2.id], [ { to: 'aaa',
      op: 'client_offline',
      value: {
        userId: 1,
        userType: 2,
        clientId: this.client.id
      }} ]);

      done();
    },

    'one does a ungraceful disconnect, the other one does a explicit disconnect': function(done) {
      var presence = this.presence, client = this.client, client2 = this.client2;

      presence.unsubscribe(client);
      // and the autopublish runs
      presence._autoPublish();
      // there should be one notification - the autopublish renewal
      assert.equal(1, this.notifications.length);
      assert.deepEqual({ userId: 1, userType: 2, online: true}, this.notifications[0]);

      presence.setStatus(this.client2, { key: 1, type: 2, value: 'offline' } );
      // there should be a disconnect notification
      assert.equal(2, this.notifications.length);
      assert.deepEqual({ userId: 1, userType: 2, online: false}, this.notifications[1]);
      // there should be a client_offline message for client 1
      assert.deepEqual(this.messages[this.client2.id], [ { to: 'aaa',
      op: 'client_offline',
      value: {
        userId: 1,
        userType: 2,
        clientId: this.client.id
      }} ]);

      done();
    }
  },

  'when a user is on two servers, and goes explicitly offline on one, the other one should remain online': function(done) {
    done();
  },

  'local users are written to Redis periodically': function(done) {
    var presence = this.presence, client = this.client;

    var notifications = [];
    Persistence.publish = function(scope, data) {
      var m = JSON.parse(data),
          online = m.online,
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

  'users that are queued to disconnect and are still gone are gone, users that reconnect are excluded': function(done) {
    var presence = this.presence, client = this.client, client2 = new MiniEE();
    client2.id = counter++;
    presence.setStatus(client, { key: 1, type: 2, value: 'online' } );

    assert.equal(presence._disconnectQueue.length, 0);
    presence.unsubscribe(client);
    // disconnect is queued
    assert.equal(presence._disconnectQueue.length, 1);

    presence.setStatus(client2, { key: 123, type: 0, value: 'online' } );
    presence.unsubscribe(client2);
    // disconnect is queued
    assert.equal(presence._disconnectQueue.length, 2);

    // now client 1 reconnects
    presence.setStatus(client, { key: 1, type: 2, value: 'online' } );

    var notifications = [];
    Persistence.publish = function(scope, data) {
      var m = JSON.parse(data),
          online = m.online,
          userId = m.userId,
          userType = m.userType;
      notifications.push({ userId: userId, userType: userType, online: online });
    };
    Presence.broadcast = function(message) {

    };
    console.log('run auto');
    // and the autopublish runs
    presence._xserver.timeouts();
    presence._processDisconnects();
    // client 1 should emit periodic online and 123 should have emitted offline
    console.log(notifications);
    assert.ok(notifications.some(function(msg) { return msg.userId == 1 && msg.userType == 2 && msg.online == true; } ));
    assert.ok(notifications.some(function(msg) { return msg.userId == 123 && msg.userType == 0 && msg.online == false; } ));

    done();
  }

};

// if this module is the script being run, then run the tests:
if (module == require.main) {
  var mocha = require('child_process').spawn('mocha', [ '--colors', '--ui', 'exports', '--reporter', 'spec', __filename ]);
  mocha.stdout.pipe(process.stdout);
  mocha.stderr.pipe(process.stderr);
}
