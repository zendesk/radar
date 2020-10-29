/* globals describe, it, beforeEach, before, after */
const assert = require('assert')
const Common = require('./common')
const MessageList = require('../src/core/resources/message_list')
const Persistence = require('persistence')

describe('For a message list', function () {
  let messageList
  const Radar = {
    broadcast: function () {}
  }
  const FakePersistence = {
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
    messageList = new MessageList('aaa', Radar, {})
    FakePersistence.publish = function () {}
    FakePersistence.readOrderedWithScores = function () {}
    FakePersistence.persistOrdered = function () {}
    FakePersistence.expire = function () {}
  })

  describe('publishing', function () {
    it('causes a publish to persistence', function () {
      let publishCalled = false
      FakePersistence.publish = function (key, message) {
        assert.strictEqual('hello world', message)
        publishCalled = true
      }

      messageList.publish({}, 'hello world')
      assert.ok(publishCalled)
    })

    describe('if cache is set to true', function () {
      it('causes a broadcast and a write', function () {
        let publishCalled = false
        let persistCalled = false
        FakePersistence.publish = function (key, message) {
          assert.strictEqual('hello world', message)
          publishCalled = true
        }
        FakePersistence.persistOrdered = function () {
          persistCalled = true
        }
        const messageList = new MessageList('aab', Radar, { policy: { cache: true } })
        messageList.publish({}, 'hello world')
        assert.ok(publishCalled)
        assert.ok(persistCalled)
      })

      it('sets expiry if maxPersistence is provided', function () {
        let expiryTime
        FakePersistence.expire = function (name, expiry) {
          expiryTime = expiry
        }
        const messageList = new MessageList('aab', Radar, { policy: { cache: true, maxPersistence: 24 * 60 * 60 } })
        messageList.publish({}, 'hello world')
        assert.strictEqual(expiryTime, 24 * 60 * 60)
      })

      it('sets expiry to default maxPersistence if none provided', function () {
        let expiryTime
        FakePersistence.expire = function (name, expiry) {
          expiryTime = expiry
        }
        const messageList = new MessageList('aab', Radar, { policy: { cache: true } })
        messageList.publish({}, 'hello world')
        assert.strictEqual(expiryTime, 14 * 24 * 60 * 60)
      })
    })
  })

  describe('syncing', function () {
    it('causes a read', function (done) {
      const messageList = new MessageList('aab', Radar, { policy: { cache: true } })
      FakePersistence.readOrderedWithScores = function (key, value, callbackFn) {
        assert.strictEqual('aab', key)
        callbackFn([1, 2])
      }

      messageList.sync({
        send: function (msg) {
          // Check message
          assert.strictEqual('sync', msg.op)
          assert.strictEqual('aab', msg.to)
          assert.deepStrictEqual([1, 2], msg.value)
          done()
        }
      }, {})
    })

    it('renews expiry for maxPersistence', function (done) {
      let expiryTime
      const messageList = new MessageList('aab', Radar, { policy: { cache: true, maxPersistence: 24 * 60 * 60 } })
      FakePersistence.readOrderedWithScores = function (key, value, callbackFn) {
        assert.strictEqual('aab', key)
        callbackFn([1, 2])
      }
      FakePersistence.expire = function (name, expiry) {
        expiryTime = expiry
      }

      messageList.sync({
        send: function () {
          assert.strictEqual(expiryTime, 24 * 60 * 60)
          done()
        }
      }, {})
    })
  })

  describe('unsubscribing', function () {
    it('renews expiry for maxPersistence', function (done) {
      const messageList = new MessageList('aab', Radar, { policy: { cache: true, maxPersistence: 24 * 60 * 60 } })
      messageList.server = { destroyResource: function () {} }
      FakePersistence.expire = function (name, expiry) {
        assert.strictEqual(expiry, 24 * 60 * 60)
        setTimeout(done, 1)
      }

      messageList.unsubscribe({
        send: function () {}
      }, {})
    })
  })

  it('default maxPersistence is 14 days', function () {
    assert.strictEqual(messageList.options.policy.maxPersistence, 14 * 24 * 60 * 60)
  })

  it('default caching is false', function () {
    assert.ok(!messageList.options.policy.cache)
  })
})

describe('a message list resource', function () {
  describe('emitting messages', function () {
    let radarServer

    beforeEach(function (done) {
      radarServer = Common.createRadarServer(done)
    })

    it('should emit incomming messages', function (done) {
      const subscribeMessage = { op: 'subscribe', to: 'message:/z1/test/ticket/1' }

      radarServer.on('resource:new', function (resource) {
        resource.on('message:incoming', function (message) {
          assert.strictEqual(message.to, subscribeMessage.to)
          done()
        })
      })

      setTimeout(function () {
        radarServer._processMessage({}, subscribeMessage)
      }, 100)
    })

    it('should emit outgoing messages', function (done) {
      const subscribeMessage = { op: 'subscribe', to: 'message:/z1/test/ticket/1' }
      const publishMessage = { op: 'publish', to: 'message:/z1/test/ticket/1', value: { type: 'activity', user_id: 123456789, state: 4 } }
      const socketOne = { id: 1, send: function (m) {} }
      const socketTwo = { id: 2, send: function (m) {} }

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
