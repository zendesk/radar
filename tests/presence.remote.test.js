var assert = require('assert'),
    Heartbeat = require('../core/lib/Heartbeat.js'),
    Persistence = require('persistence'),
    Presence = require('../index.js').core.Presence;

require('./common.js');

var Server = {
  timer: new Heartbeat().interval(1500),
  broadcast: function() { },
  terminate: function() { Server.timer.clear(); },
  destroy: function() {},
  server: {
    clients: { }
  }
};

var FakePersistence = { };

exports['given a presence monitor'] = {

  beforeEach: function() {
    this.presence = new Presence('aaa', Server, {});
  },

  before: function() {
    Presence.setBackend(FakePersistence);
  },

  after: function() {
    Presence.setBackend(Persistence);
  },

  'messages from Redis trigger immediate notifications if new': function(done) {
    var presence = this.presence;
    presence._xserver.once('user_online', function(userId, userType) {
      assert.equal(123, userId);
      assert.equal(0, userType);
      // we assume that messages always arrive in separate ticks
      process.nextTick(function() {
        presence._xserver.once('user_offline', function(userId, userType) {
          assert.equal(123, userId);
          assert.equal(0, userType);
          done();
        });
        // remote and local messages are treated differently
        // namely, remote messages about local clients cannot trigger the fast path
        presence.redisIn({ online: false, userId: 123, clientId: 'aab', userType: 0, at: 0});
        // manually trigger the disconnect processing
        presence._xserver._processDisconnects();
      });
    });
    presence.redisIn({ online: true, userId: 123, clientId: 'aab', userType: 0, at: Date.now()});
  },

  'messages from Redis are not broadcast, only changes in status are': function() {
    var presence = this.presence;
    var updates = [];
    // replace function
    presence._xserver.on('user_online', function(userId, userType) {
      updates.push([true, userId, userType]);
    });
    presence._xserver.on('user_offline', function(userId, userType) {
      updates.push([false, userId, userType]);
    });

    this.presence.redisIn({
      userId: 123,
      userType: 2,
      clientId: 'aab',
      online: true,
      at: Date.now()
    });
    assert.equal(1, updates.length);
    assert.deepEqual([true, 123, 2], updates[0]);

    // receiving the same info twice should have no effect
    this.presence.redisIn({
      userId: 123,
      userType: 2,
      clientId: 'aab',
      online: true,
      at: Date.now()
    });
    assert.equal(1, updates.length);

    // if we receive a online message for a different client, send it
    this.presence.redisIn({
      userId: 345,
      userType: 0,
      clientId: 'ccc',
      online: true,
      at: Date.now()
    });

    assert.equal(2, updates.length);
    assert.deepEqual([true, 345, 0], updates[1]);

    // do not send notifications for users that were never online
    this.presence.redisIn({
      userId: 456,
      userType: 2,
      clientId: 'bbb',
      online: false,
      at: Date.now()
    });
    assert.equal(2, updates.length);

    // do send changes to user that were online
    this.presence.redisIn({
      userId: 123,
      userType: 2,
      clientId: 'aab',
      online: false,
      at: Date.now()
    });
    assert.equal(3, updates.length);
    assert.deepEqual([false, 123, 2], updates[2]);
  },

  'setting status twice does not cause duplicate notifications': function(done) {
    var presence = this.presence;
    var calls = 0;
    presence._xserver.on('user_online', function(userId, userType) {
      assert.equal(123, userId);
      assert.equal(0, userType);
      calls++;
    });

    presence.redisIn({ online: true, userId: 123, userType: 0, clientId: 'aab', at: Date.now()});
    presence.redisIn({ online: true, userId: 123, userType: 0, at: Date.now()});

    assert.equal(1, calls);
    done();
  },

  'string userId is treated the same as int userId': function(done) {
    var presence = this.presence;
    var calls = 0;
    presence._xserver.on('user_online', function(userId, userType) {
      assert.equal(123, userId);
      assert.equal(0, userType);
      calls++;
    });

    presence.redisIn({ online: true, userId: 123, userType: 0, clientId: 'aab', at: Date.now()});
    presence.redisIn({ online: true, userId: '123', userType: 0, clientId: 'aab', at: Date.now()});

    assert.equal(1, calls);
    done();
  },

  'full reads consider users with a recent online key as online and users without a key as offline': function(done) {
    FakePersistence.readHashAll = function(scope, callback) {
      callback({
        123: { online: true, userId: 123, userType: 0, clientId: 'aab', at: Date.now()},
        124: { online: true, userId: 124, userType: 2, clientId: 'bbb', at: Date.now()}
      });
    };
    var users = {};
    this.presence._xserver.on('user_online', function(userId, userType) {
      users[userId] = userType;
    });

    this.presence.fullRead(function(online) {
      assert.deepEqual({ 123: 0, 124: 2}, online);
      assert.deepEqual({ 123: 0, 124: 2}, users);
      done();
    });
  },

  'full reads exclude users that were set to online a long time ago as offline': function(done) {
    // this may happen if the server gets terminated, so the key is never deleted properly...
    FakePersistence.readHashAll = function(scope, callback) {
      callback({
        123: { online: true, userId: 123, userType: 0, clientId: 'aab', at: Date.now() - 50 * 1000},
        124: { online: true, userId: 124, userType: 2, clientId: 'bbb', at: Date.now()},
      });
    };
    this.presence.fullRead(function(online) {
      assert.deepEqual({ 124: 2}, online);
      done();
    });
  },

  'full reads cause change events based on what was previously known': function(done) {
    var presence = this.presence;
    // make 123 online
    presence.redisIn({ online: true, userId: 123, userType: 0, clientId: 'aab', at: Date.now()});

    FakePersistence.readHashAll = function(scope, callback) {
      callback({
        123: { online: true, userId: 123, userType: 0, clientId: 'aab', at: Date.now() - 50 * 1000},
        124: { online: true, userId: 124, userType: 2, clientId: 'bbb', at: Date.now()},
      });
    };
    var added = {}, removed = {};
    presence._xserver.on('user_online', function(userId, userType) {
      added[userId] = userType;
    });
    presence._xserver.on('user_offline', function(userId, userType) {
      removed[userId] = userType;
    });

    this.presence.fullRead(function(online) {
      assert.deepEqual({ 123: 0}, removed);
      assert.deepEqual({ 124: 2}, added);
      assert.deepEqual({ 124: 2}, online);
      done();
    });
  },

  'when there are two messages for a single user - one setting the user offline and another setting it online, the online prevails': function(done) {
    var presence = this.presence;

    FakePersistence.readHashAll = function(scope, callback) {
      callback({
        // so, one clientId disconnected and another connected - at the same timestamp: user should be considered to be online
        '200.aaz': { online: true, userId: 200, userType: 2, clientId: 'aaz', at: Date.now()},
        '200.sss': { online: false, userId: 200, userType: 2, clientId: 'sss', at: Date.now()},
        '200.1a': { online: false, userId: 200, userType: 2, clientId: '1a', at: Date.now()},
        '201.aaq': { online: false, userId: 201, userType: 4, clientId: 'aaq', at: Date.now()},
        '201.www': { online: true, userId: 201, userType: 4, clientId: 'www', at: Date.now()},
      });
    };

    var added = {}, removed = {};
    presence._xserver.on('user_online', function(userId, userType) {
      added[userId] = userType;
    });
    presence._xserver.on('user_offline', function(userId, userType) {
      removed[userId] = userType;
    });

    this.presence.fullRead(function(online) {
      assert.deepEqual({ }, removed);
      assert.deepEqual({ 200: 2, 201: 4 }, added);
      assert.deepEqual({ 200: 2, 201: 4 }, online);
      done();
    });
  }

};
