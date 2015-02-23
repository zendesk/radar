var assert = require('assert'),
    Persistence = require('persistence'),
    Presence = require('../index.js').core.Presence,
    Common = require('./common.js');

var Server = {
  broadcast: function() { },
  server: {
    clients: { }
  }
};
var readHashAll = Persistence.readHashAll;

exports['given a presence monitor'] = {

  beforeEach: function(done) {
    var self = this;
    Common.startPersistence(function() {
      Presence.sentry.start();
      self.presence = new Presence('aaa', Server, {});
      Persistence.readHashAll = readHashAll;
      done();
    });
  },

  afterEach: function(done) {
    Presence.sentry.stop();
    Common.endPersistence(done);
  },

  'messages from Redis trigger immediate notifications if new': function(done) {
    var presence = this.presence;
    presence.manager.once('user_online', function(userId, userType) {
      assert.equal(123, userId);
      assert.equal(0, userType);
      // we assume that messages always arrive in separate ticks
      process.nextTick(function() {
        presence.manager.once('user_offline', function(userId, userType) {
          assert.equal(123, userId);
          assert.equal(0, userType);
          done();
        });
        // remote and local messages are treated differently
        // namely, remote messages about local clients cannot trigger the fast path
        presence.redisIn({ online: false, userId: 123, clientId: 'aab', userType: 0, sentry: Presence.sentry.name});
      });
    });
    presence.redisIn({ online: true, userId: 123, clientId: 'aab', userType: 0, sentry: Presence.sentry.name});
  },

  'messages from Redis are not broadcast, only changes in status are': function() {
    var presence = this.presence;
    var updates = [];
    // replace function
    presence.manager.on('user_online', function(userId, userType) {
      updates.push([true, userId, userType]);
    });
    presence.manager.on('user_offline', function(userId, userType) {
      updates.push([false, userId, userType]);
    });

    this.presence.redisIn({
      userId: 123,
      userType: 2,
      clientId: 'aab',
      online: true,
      sentry: Presence.sentry.name
    });
    assert.equal(1, updates.length);
    assert.deepEqual([true, 123, 2], updates[0]);

    // receiving the same info twice should have no effect
    this.presence.redisIn({
      userId: 123,
      userType: 2,
      clientId: 'aab',
      online: true,
      sentry: Presence.sentry.name
    });
    assert.equal(1, updates.length);

    // if we receive a online message for a different client, send it
    this.presence.redisIn({
      userId: 345,
      userType: 0,
      clientId: 'ccc',
      online: true,
      sentry: Presence.sentry.name
    });

    assert.equal(2, updates.length);
    assert.deepEqual([true, 345, 0], updates[1]);

    // do not send notifications for users that were never online
    this.presence.redisIn({
      userId: 456,
      userType: 2,
      clientId: 'bbb',
      online: false,
      sentry: Presence.sentry.name
    });
    assert.equal(2, updates.length);

    // do send changes to user that were online
    this.presence.redisIn({
      userId: 123,
      userType: 2,
      clientId: 'aab',
      online: false,
      sentry: Presence.sentry.name
    });
    assert.equal(3, updates.length);
    assert.deepEqual([false, 123, 2], updates[2]);
  },

  'setting status twice does not cause duplicate notifications': function(done) {
    var presence = this.presence;
    var calls = 0;
    presence.manager.on('user_online', function(userId, userType) {
      assert.equal(123, userId);
      assert.equal(0, userType);
      calls++;
    });

    presence.redisIn({ online: true, userId: 123, userType: 0, clientId: 'aab', sentry: Presence.sentry.name });
    presence.redisIn({ online: true, userId: 123, userType: 0, sentry: Presence.sentry.name });

    assert.equal(1, calls);
    done();
  },

  'string userId is treated the same as int userId': function(done) {
    var presence = this.presence;
    var calls = 0;
    presence.manager.on('user_online', function(userId, userType) {
      assert.equal(123, userId);
      assert.equal(0, userType);
      calls++;
    });

    presence.redisIn({ online: true, userId: 123, userType: 0, clientId: 'aab', sentry: Presence.sentry.name });
    presence.redisIn({ online: true, userId: '123', userType: 0, clientId: 'aab', sentry: Presence.sentry.name });

    assert.equal(1, calls);
    done();
  },

  'full reads consider users with a valid sentry as online': function(done) {
    Persistence.readHashAll = function(scope, callback) {
      callback({
        123: { online: true, userId: 123, userType: 0, clientId: 'aab', sentry: Presence.sentry.name },
        124: { online: true, userId: 124, userType: 2, clientId: 'bbb', sentry: Presence.sentry.name }
      });
    };
    var users = {};
    this.presence.manager.on('user_online', function(userId, userType) {
      users[userId] = userType;
    });

    this.presence.fullRead(function(online) {
      assert.deepEqual({ 123: 0, 124: 2}, online);
      assert.deepEqual({ 123: 0, 124: 2}, users);
      done();
    });
  },

  'full reads exclude users that were set to online with an invalid sentry': function(done) {
    // this may happen if the server gets terminated, so the key is never deleted properly...
    Persistence.readHashAll = function(scope, callback) {
      callback({
        123: { online: true, userId: 123, userType: 0, clientId: 'aab', sentry: 'unknown'},
        124: { online: true, userId: 124, userType: 2, clientId: 'bbb', sentry: Presence.sentry.name},
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
    presence.redisIn({ online: true, userId: 123, userType: 0, clientId: 'aab', sentry: Presence.sentry.name });

    Persistence.readHashAll = function(scope, callback) {
      callback({
        123: { online: false, userId: 123, userType: 0, clientId: 'aab', sentry: Presence.sentry.name},
        124: { online: true, userId: 124, userType: 2, clientId: 'bbb', sentry: Presence.sentry.name },
      });
    };
    var added = {}, removed = {};
    presence.manager.on('user_online', function(userId, userType) {
      added[userId] = userType;
    });
    presence.manager.on('user_offline', function(userId, userType) {
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

    Persistence.readHashAll = function(scope, callback) {
      callback({
        // so, one clientId disconnected and another connected - at the same timestamp: user should be considered to be online
        '200.aaz': { online: true, userId: 200, userType: 2, clientId: 'aaz', sentry: Presence.sentry.name },
        '200.sss': { online: false, userId: 200, userType: 2, clientId: 'sss', sentry: Presence.sentry.name },
        '200.1a': { online: false, userId: 200, userType: 2, clientId: '1a', sentry: Presence.sentry.name },
        '201.aaq': { online: false, userId: 201, userType: 4, clientId: 'aaq', sentry: Presence.sentry.name },
        '201.www': { online: true, userId: 201, userType: 4, clientId: 'www', sentry: Presence.sentry.name },
      });
    };

    var added = {}, removed = {};
    presence.manager.on('user_online', function(userId, userType) {
      added[userId] = userType;
    });
    presence.manager.on('user_offline', function(userId, userType) {
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
