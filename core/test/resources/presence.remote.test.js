var assert = require('assert'),
    Heartbeat = require('heartbeat'),

    Persistence = require('../../lib/persistence.js'),
    Presence = require('../../lib/resources/presence');

var Server = {
  timer: new Heartbeat().interval(1500),
  broadcast: function(subscribers, message) { },
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
        presence.redisIn(JSON.stringify({ online: false, userId: 123, clientId: 'aab', userType: 0, at: 0}));
        // manually trigger the disconnect processing
        presence._xserver._processDisconnects();
      });
    });
    presence.redisIn(JSON.stringify({ online: true, userId: 123, clientId: 'aab', userType: 0, at: new Date().getTime()}));
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

    this.presence.redisIn(JSON.stringify({
      userId: 123,
      userType: 2,
      clientId: 'aab',
      online: true,
      at: new Date().getTime()
    }));
    assert.equal(1, updates.length);
    assert.deepEqual([true, 123, 2], updates[0]);

    // receiving the same info twice should have no effect
    this.presence.redisIn(JSON.stringify({
      userId: 123,
      userType: 2,
      clientId: 'aab',
      online: true,
      at: new Date().getTime()
    }));
    assert.equal(1, updates.length);

    // if we receive a online message for a different client, send it
    this.presence.redisIn(JSON.stringify({
      userId: 345,
      userType: 0,
      clientId: 'ccc',
      online: true,
      at: new Date().getTime()
    }));

    assert.equal(2, updates.length);
    assert.deepEqual([true, 345, 0], updates[1]);

    // do not send notifications for users that were never online
    this.presence.redisIn(JSON.stringify({
      userId: 456,
      userType: 2,
      clientId: 'bbb',
      online: false,
      at: new Date().getTime()
    }));
    assert.equal(2, updates.length);

    // do send changes to user that were online
    this.presence.redisIn(JSON.stringify({
      userId: 123,
      userType: 2,
      clientId: 'aab',
      online: false,
      at: new Date().getTime()
    }));
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

    presence.redisIn(JSON.stringify({ online: true, userId: 123, userType: 0, clientId: 'aab', at: new Date().getTime()}));
    presence.redisIn(JSON.stringify({ online: true, userId: 123, userType: 0, at: new Date().getTime()}));

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

    presence.redisIn(JSON.stringify({ online: true, userId: 123, userType: 0, clientId: 'aab', at: new Date().getTime()}));
    presence.redisIn(JSON.stringify({ online: true, userId: '123', userType: 0, clientId: 'aab', at: new Date().getTime()}));

    assert.equal(1, calls);
    done();
  },

  'full reads consider users with a recent online key as online and users without a key as offline': function(done) {
    FakePersistence.readHashAll = function(scope, callback) {
      callback({
        123: JSON.stringify({ online: true, userId: 123, userType: 0, clientId: 'aab', at: new Date().getTime()}),
        124: JSON.stringify({ online: true, userId: 124, userType: 2, clientId: 'bbb', at: new Date().getTime()}),
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
        123: JSON.stringify({ online: true, userId: 123, userType: 0, clientId: 'aab', at: new Date().getTime() - 50 * 1000}),
        124: JSON.stringify({ online: true, userId: 124, userType: 2, clientId: 'bbb', at: new Date().getTime()}),
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
    presence.redisIn(JSON.stringify({ online: true, userId: 123, userType: 0, clientId: 'aab', at: new Date().getTime()}));

    FakePersistence.readHashAll = function(scope, callback) {
      callback({
        123: JSON.stringify({ online: true, userId: 123, userType: 0, clientId: 'aab', at: new Date().getTime() - 50 * 1000}),
        124: JSON.stringify({ online: true, userId: 124, userType: 2, clientId: 'bbb', at: new Date().getTime()}),
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
        '200.aaz': JSON.stringify({ online: true, userId: 200, userType: 2, clientId: 'aaz', at: new Date().getTime()}),
        '200.sss': JSON.stringify({ online: false, userId: 200, userType: 2, clientId: 'sss', at: new Date().getTime()}),
        '200.1a': JSON.stringify({ online: false, userId: 200, userType: 2, clientId: '1a', at: new Date().getTime()}),
        '201.aaq': JSON.stringify({ online: false, userId: 201, userType: 4, clientId: 'aaq', at: new Date().getTime()}),
        '201.www': JSON.stringify({ online: true, userId: 201, userType: 4, clientId: 'www', at: new Date().getTime()}),
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

// if this module is the script being run, then run the tests:
if (module == require.main) {
  var mocha = require('child_process').spawn('mocha', [ '--colors', '--ui', 'exports', '--reporter', 'spec', __filename ]);
  mocha.stdout.pipe(process.stdout);
  mocha.stderr.pipe(process.stderr);
}
