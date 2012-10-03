var assert = require('assert'),

    Persistence = require('../lib/persistence.js'),
    PresenceMonitor = require('../lib/presence_monitor.js');

var FakePersistence = { };

exports['given a presence monitor'] = {

  before: function(done) {
    PresenceMonitor.setBackend(FakePersistence);
    done();
  },

  after: function(done) {
    PresenceMonitor.setBackend(Persistence);
    done();
  },

  beforeEach: function(done) {
    this.presence = new PresenceMonitor('aaa');
    done();
  },

  'messages from Redis trigger immediate notifications if new': function(done) {
    var presence = this.presence;
    presence.once('user_added', function(userId, userType) {
      assert.equal(123, userId);
      assert.equal(0, userType);
      presence.once('user_removed', function(userId, userType) {
        assert.equal(123, userId);
        assert.equal(0, userType);
        done();
      });
      presence.redisIn({ online: false, userId: 123, userType: 0, at: 0});
    });
    presence.redisIn({ online: true, userId: 123, userType: 0, at: new Date().getTime()});
  },

  'messages from Redis are not broadcast, only changes in status are': function(done) {
    var presence = this.presence;
    var updates = [];
    // replace function
    presence.on('user_added', function(userId, userType) {
      updates.push([true, userId, userType]);
    });
    presence.on('user_removed', function(userId, userType) {
      updates.push([false, userId, userType]);
    });

    this.presence.redisIn({
      userId: 123,
      userType: 2,
      online: true,
      at: new Date().getTime()
    });
    assert.equal(1, updates.length);
    assert.deepEqual([true, 123, 2], updates[0]);

    this.presence.redisIn({
      userId: 123,
      userType: 2,
      online: true,
      at: new Date().getTime()
    });
    assert.equal(1, updates.length);

    this.presence.redisIn({
      userId: 345,
      userType: 0,
      online: true,
      at: new Date().getTime()
    });

    assert.equal(2, updates.length);
    assert.deepEqual([true, 345, 0], updates[1]);

    this.presence.redisIn({
      userId: 456,
      userType: 2,
      online: false,
      at: new Date().getTime()
    });
    assert.equal(2, updates.length);

    this.presence.redisIn({
      userId: 123,
      userType: 2,
      online: false,
      at: new Date().getTime()
    });
    assert.equal(3, updates.length);
    assert.deepEqual([false, 123, 2], updates[2]);

    done();
  },

  'setting status twice does not cause duplicate notifications': function(done) {
    var presence = this.presence;
    var calls = 0;
    presence.on('user_added', function(userId, userType) {
      assert.equal(123, userId);
      assert.equal(0, userType);
      calls++;
    });

    presence.redisIn({ online: true, userId: 123, userType: 0, at: new Date().getTime()});
    presence.redisIn({ online: true, userId: 123, userType: 0, at: new Date().getTime()});

    assert.equal(1, calls);
    done();
  },

  'string userId is treated the same as int userId': function(done) {
    var presence = this.presence;
    var calls = 0;
    presence.on('user_added', function(userId, userType) {
      assert.equal(123, userId);
      assert.equal(0, userType);
      calls++;
    });

    presence.redisIn({ online: true, userId: 123, userType: 0, at: new Date().getTime()});
    presence.redisIn({ online: true, userId: '123', userType: 0, at: new Date().getTime()});

    assert.equal(1, calls);
    done();
  },

  'full reads consider users with a recent online key as online and users without a key as offline': function(done) {
    FakePersistence.readHashAll = function(scope, callback) {
      callback({
        123: JSON.stringify({ online: true, userId: 123, userType: 0, at: new Date().getTime()}),
        124: JSON.stringify({ online: true, userId: 124, userType: 2, at: new Date().getTime()}),
      });
    };
    var users = {};
    this.presence.on('user_added', function(userId, userType) {
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
        123: JSON.stringify({ online: true, userId: 123, userType: 0, at: new Date().getTime() - 50 * 1000}),
        124: JSON.stringify({ online: true, userId: 124, userType: 2, at: new Date().getTime()}),
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
    presence.redisIn({ online: true, userId: 123, userType: 0, at: new Date().getTime()});

    FakePersistence.readHashAll = function(scope, callback) {
      callback({
        123: JSON.stringify({ online: true, userId: 123, userType: 0, at: new Date().getTime() - 50 * 1000}),
        124: JSON.stringify({ online: true, userId: 124, userType: 2, at: new Date().getTime()}),
      });
    };
    var added = {}, removed = {};
    presence.on('user_added', function(userId, userType) {
      added[userId] = userType;
    });
    presence.on('user_removed', function(userId, userType) {
      removed[userId] = userType;
    });

    this.presence.fullRead(function(online) {
      assert.deepEqual({ 123: 0}, removed);
      assert.deepEqual({ 124: 2}, added);
      assert.deepEqual({ 124: 2}, online);
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
