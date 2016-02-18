/* globals describe, it, beforeEach, before, after */
var assert = require('assert')
var Common = require('./common')
var MessageList = require('../src/core/lib/resources/message_list')
var Persistence = require('persistence')

describe('For a message list', function () {
  var message_list
  var Radar = {
    broadcast: function () {}
  }
  var FakePersistence = {
    read: function () {},
    persist: function () {},
    publish: function () {},
    expire: function () {}
  }

  before(function () {
    MessageList.setBackend(FakePersistence)
  })

  after(function () {
    MessageList.setBackend(Persistence)
  })

  beforeEach(function () {
    message_list = new MessageList('aaa', Radar, {})
    FakePersistence.publish = function () {}
    FakePersistence.readOrderedWithScores = function () {}
    FakePersistence.persistOrdered = function () {}
    FakePersistence.expire = function () {}
  })

  describe('publishing', function () {
    it('causes a publish to persistence', function () {
      var publishCalled = false
      FakePersistence.publish = function (key, message) {
        assert.equal('hello world', message)
        publishCalled = true
      }

      message_list.publish({}, 'hello world')
      assert.ok(publishCalled)
    })

    describe('if cache is set to true', function () {
      it('causes a broadcast and a write', function () {
        var publishCalled = false
        var persistCalled = false
        FakePersistence.publish = function (key, message) {
          assert.equal('hello world', message)
          publishCalled = true
        }
        FakePersistence.persistOrdered = function () {
          persistCalled = true
        }
        var message_list = new MessageList('aab', Radar, { policy: { cache: true } })
        message_list.publish({}, 'hello world')
        assert.ok(publishCalled)
        assert.ok(persistCalled)
      })

      it('sets expiry if maxPersistence is provided', function () {
        var expiryTime
        FakePersistence.expire = function (name, expiry) {
          expiryTime = expiry
        }
        var message_list = new MessageList('aab', Radar, { policy: { cache: true, maxPersistence: 24 * 60 * 60 } })
        message_list.publish({}, 'hello world')
        assert.equal(expiryTime, 24 * 60 * 60)
      })

      it('sets expiry to default maxPersistence if none provided', function () {
        var expiryTime
        FakePersistence.expire = function (name, expiry) {
          expiryTime = expiry
        }
        var message_list = new MessageList('aab', Radar, { policy: { cache: true } })
        message_list.publish({}, 'hello world')
        assert.equal(expiryTime, 14 * 24 * 60 * 60)
      })
    })
  })

  describe('syncing', function () {
    it('causes a read', function (done) {
      var message_list = new MessageList('aab', Radar, { policy: { cache: true } })
      FakePersistence.readOrderedWithScores = function (key, value, callback) {
        assert.equal('aab', key)
        callback([1, 2])
      }

      message_list.sync({
        send: function (msg) {
          // Check message
          assert.equal('sync', msg.op)
          assert.equal('aab', msg.to)
          assert.deepEqual([1, 2], msg.value)
          done()
        }
      }, {})
    })

    it('renews expiry for maxPersistence', function (done) {
      var expiryTime
      var message_list = new MessageList('aab', Radar, { policy: { cache: true, maxPersistence: 24 * 60 * 60 } })
      FakePersistence.readOrderedWithScores = function (key, value, callback) {
        assert.equal('aab', key)
        callback([1, 2])
      }
      FakePersistence.expire = function (name, expiry) {
        expiryTime = expiry
      }

      message_list.sync({
        send: function () {
          assert.equal(expiryTime, 24 * 60 * 60)
          done()
        }
      }, {})
    })
  })

  describe('unsubscribing', function () {
    it('renews expiry for maxPersistence', function (done) {
      var message_list = new MessageList('aab', Radar, { policy: { cache: true, maxPersistence: 24 * 60 * 60 } })
      message_list.server = { destroyResource: function () {} }
      FakePersistence.expire = function (name, expiry) {
        assert.equal(expiry, 24 * 60 * 60)
        setTimeout(done, 1)
      }

      message_list.unsubscribe({
        send: function () {}
      }, {})
    })
  })

  it('default maxPersistence is 14 days', function () {
    assert.equal(message_list.options.policy.maxPersistence, 14 * 24 * 60 * 60)
  })

  it('default caching is false', function () {
    assert.ok(!message_list.options.policy.cache)
  })
})

describe('a message list resource', function () {
  describe('emitting messages', function () {
    var radarServer

    beforeEach(function (done) {
      radarServer = Common.createRadarServer(done)
    })

    it('should emit incomming messages', function (done) {
      var subscribeMessage = { op: 'subscribe', to: 'message:/z1/test/ticket/1' }

      radarServer.on('resource:new', function (resource) {
        resource.on('message:incoming', function (message) {
          assert.equal(message.to, subscribeMessage.to)
          done()
        })
      })

      setTimeout(function () {
        radarServer._processMessage({}, subscribeMessage)
      }, 100)
    })

    it('should emit outgoing messages', function (done) {
      var subscribeMessage = { op: 'subscribe', to: 'message:/z1/test/ticket/1' }
      var publishMessage = { op: 'publish', to: 'message:/z1/test/ticket/1', value: {'type': 'activity', 'user_id': 123456789, 'state': 4} }
      var socketOne = { id: 1, send: function (m) {} }
      var socketTwo = { id: 2, send: function (m) {} }

      radarServer.on('resource:new', function (resource) {
        resource.on('message:outgoing', function (message) {
          done()
        })
      })

      setTimeout(function () {
        radarServer._processMessage(socketOne, subscribeMessage)
        radarServer._processMessage(socketTwo, publishMessage)
      }, 100)
    })
  })
})
