/* globals */
var assert = require('assert')
var Persistence = require('persistence')
var Presence = require('../index.js').core.Presence
var Common = require('./common.js')
var readHashAll = Persistence.readHashAll
var chai = require('chai')
var expect = chai.expect

var Server = {
  broadcast: function () {},
  server: {
    clients: { }
  },
  sentry: {
    start: function (opts, cb) { cb() },
    on: function () {},
    stop: function () {},
    isDown: function (sentryId) { return sentryId === 'unknown' }
  }
}

exports['given a presence monitor'] = {
  beforeEach: function (done) {
    var self = this
    Persistence.readHashAll = readHashAll
    Common.startPersistence(function () {
      self.presence = new Presence('aaa', Server, {})
      done()
    })
  },

  afterEach: function (done) {
    Common.endPersistence(done)
  },

  'messages from Redis trigger immediate notifications if new': function (done) {
    var presence = this.presence
    presence.manager.once('user_online', function (userId, userType) {
      assert.strictEqual(123, userId)
      assert.strictEqual(0, userType)
      // We assume that messages always arrive in separate ticks
      process.nextTick(function () {
        presence.manager.once('user_offline', function (userId, userType) {
          assert.strictEqual(123, userId)
          assert.strictEqual(0, userType)
          done()
        })
        // Remote and local messages are treated differently
        // Namely, remote messages about local clients cannot trigger the fast path
        presence.redisIn({ online: false, userId: 123, clientId: 'aab', userType: 0, sentry: presence.sentry.name })
      })
    })
    presence.redisIn({ online: true, userId: 123, clientId: 'aab', userType: 0, sentry: presence.sentry.name })
  },

  'messages from Redis are not broadcast, only changes in status are': function () {
    var presence = this.presence
    var updates = []
    // Replace function
    presence.manager.on('user_online', function (userId, userType) {
      updates.push([true, userId, userType])
    })
    presence.manager.on('user_offline', function (userId, userType) {
      updates.push([false, userId, userType])
    })

    this.presence.redisIn({
      userId: 123,
      userType: 2,
      clientId: 'aab',
      online: true,
      sentry: presence.sentry.name
    })
    assert.strictEqual(1, updates.length)
    assert.deepStrictEqual([true, 123, 2], updates[0])

    // Receiving the same info twice should have no effect
    this.presence.redisIn({
      userId: 123,
      userType: 2,
      clientId: 'aab',
      online: true,
      sentry: presence.sentry.name
    })
    assert.strictEqual(1, updates.length)

    // If we receive a online message for a different client, send it
    this.presence.redisIn({
      userId: 345,
      userType: 0,
      clientId: 'ccc',
      online: true,
      sentry: presence.sentry.name
    })

    assert.strictEqual(2, updates.length)
    assert.deepStrictEqual([true, 345, 0], updates[1])

    // Do not send notifications for users that were never online
    this.presence.redisIn({
      userId: 456,
      userType: 2,
      clientId: 'bbb',
      online: false,
      sentry: presence.sentry.name
    })
    assert.strictEqual(2, updates.length)

    // Do send changes to user that were online
    this.presence.redisIn({
      userId: 123,
      userType: 2,
      clientId: 'aab',
      online: false,
      sentry: presence.sentry.name
    })
    assert.strictEqual(3, updates.length)
    assert.deepStrictEqual([false, 123, 2], updates[2])
  },

  'setting status twice does not cause duplicate notifications': function (done) {
    var presence = this.presence
    var calls = 0
    presence.manager.on('user_online', function (userId, userType) {
      assert.strictEqual(123, userId)
      assert.strictEqual(0, userType)
      calls++
    })

    presence.redisIn({ online: true, userId: 123, userType: 0, clientId: 'aab', sentry: presence.sentry.name })
    presence.redisIn({ online: true, userId: 123, userType: 0, sentry: presence.sentry.name })

    assert.strictEqual(1, calls)
    done()
  },

  'string userId is treated the same as int userId': function (done) {
    var presence = this.presence
    var calls = 0
    presence.manager.on('user_online', function (userId, userType) {
      assert.strictEqual(123, userId)
      assert.strictEqual(0, userType)
      calls++
    })

    presence.redisIn({ online: true, userId: 123, userType: 0, clientId: 'aab', sentry: presence.sentry.name })
    presence.redisIn({ online: true, userId: 123, userType: 0, clientId: 'aab', sentry: presence.sentry.name })

    assert.strictEqual(1, calls)
    done()
  },

  'full reads consider users with a valid sentry as online': function (done) {
    var presence = this.presence
    Persistence.readHashAll = function (scope, callbackFn) {
      callbackFn({
        123: { online: true, userId: 123, userType: 0, clientId: 'aab', sentry: presence.sentry.name },
        124: { online: true, userId: 124, userType: 2, clientId: 'bbb', sentry: presence.sentry.name }
      })
    }
    var users = {}
    this.presence.manager.on('user_online', function (userId, userType) {
      users[userId] = userType
    })

    this.presence.fullRead(function (online) {
      assert.deepStrictEqual({ 123: 0, 124: 2 }, online)
      assert.deepStrictEqual({ 123: 0, 124: 2 }, users)
      done()
    })
  },

  'full reads exclude users that were set to online with an invalid sentry': function (done) {
    // This may happen if the server gets terminated, so the key is never deleted properly...
    var presence = this.presence
    Persistence.readHashAll = function (scope, callbackFn) {
      callbackFn({
        123: { online: true, userId: 123, userType: 0, clientId: 'aab', sentry: 'unknown' },
        124: { online: true, userId: 124, userType: 2, clientId: 'bbb', sentry: presence.sentry.name }
      })
    }
    this.presence.fullRead(function (online) {
      expect(online).to.deep.equal({ 124: 2 })
      done()
    })
  },

  'full reads cause change events based on what was previously known': function (done) {
    var presence = this.presence
    // Make 123 online
    presence.redisIn({ online: true, userId: 123, userType: 0, clientId: 'aab', sentry: presence.sentry.name })

    Persistence.readHashAll = function (scope, callbackFn) {
      callbackFn({
        123: { online: false, userId: 123, userType: 0, clientId: 'aab', sentry: presence.sentry.name },
        124: { online: true, userId: 124, userType: 2, clientId: 'bbb', sentry: presence.sentry.name }
      })
    }
    var added = {}
    var removed = {}
    presence.manager.on('user_online', function (userId, userType) {
      added[userId] = userType
    })
    presence.manager.on('user_offline', function (userId, userType) {
      removed[userId] = userType
    })

    this.presence.fullRead(function (online) {
      assert.deepStrictEqual({ 123: 0 }, removed)
      assert.deepStrictEqual({ 124: 2 }, added)
      assert.deepStrictEqual({ 124: 2 }, online)
      done()
    })
  },

  'when there are two messages for a single user - one setting the user offline and another setting it online, the online prevails': function (done) {
    var presence = this.presence

    Persistence.readHashAll = function (scope, callbackFn) {
      callbackFn({
        // So, one clientId disconnected and another connected - at the same timestamp: user should be considered to be online
        '200.aaz': { online: true, userId: 200, userType: 2, clientId: 'aaz', sentry: presence.sentry.name },
        '200.sss': { online: false, userId: 200, userType: 2, clientId: 'sss', sentry: presence.sentry.name },
        '200.1a': { online: false, userId: 200, userType: 2, clientId: '1a', sentry: presence.sentry.name },
        '201.aaq': { online: false, userId: 201, userType: 4, clientId: 'aaq', sentry: presence.sentry.name },
        '201.www': { online: true, userId: 201, userType: 4, clientId: 'www', sentry: presence.sentry.name }
      })
    }

    var added = {}
    var removed = {}
    presence.manager.on('user_online', function (userId, userType) {
      added[userId] = userType
    })
    presence.manager.on('user_offline', function (userId, userType) {
      removed[userId] = userType
    })

    this.presence.fullRead(function (online) {
      assert.deepStrictEqual({ }, removed)
      assert.deepStrictEqual({ 200: 2, 201: 4 }, added)
      assert.deepStrictEqual({ 200: 2, 201: 4 }, online)
      done()
    })
  }

}
