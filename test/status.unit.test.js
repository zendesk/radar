/* globals describe, it, before, after, beforeEach, afterEach */
var assert = require('assert')
var Status = require('../src/core/resources/status')
var Persistence = require('persistence')
var Common = require('./common.js')

describe('given a status resource', function () {
  var status
  var FakePersistence = {
    read: function () {},
    publish: function () {},
    expire: function () {}
  }
  var Radar = {
    broadcast: function () {}
  }

  before(function () {
    Status.setBackend(FakePersistence)
  })

  after(function () {
    Status.setBackend(Persistence)
  })

  beforeEach(function () {
    status = new Status('aaa', Radar, {})
    FakePersistence.readHashAll = function () {}
    FakePersistence.persistHash = function () {}
    FakePersistence.expire = function () {}
    FakePersistence.publish = function () {}
  })

  describe('get', function () {
    it('sends correct values to client', function (done) {
      FakePersistence.readHashAll = function (key, callbackFn) {
        assert.strictEqual('aaa', key)
        callbackFn([1, 2])
      }

      status.get({
        send: function (msg) {
          assert.strictEqual('get', msg.op)
          assert.strictEqual('aaa', msg.to)
          assert.deepStrictEqual([1, 2], msg.value)
          done()
        }
      })
    })

    it('sends {} if not present', function (done) {
      FakePersistence.readHashAll = function (key, callbackFn) {
        assert.strictEqual('aaa', key)
        callbackFn(null)
      }

      status.get({
        send: function (msg) {
          assert.strictEqual('get', msg.op)
          assert.strictEqual('aaa', msg.to)
          assert.deepStrictEqual({}, msg.value)
          done()
        }
      })
    })
  })

  describe('set', function () {
    it('online', function () {
      var message = { key: 123, value: 'online' }
      var persisted, published
      FakePersistence.persistHash = function (hash, key, value) {
        assert.strictEqual(123, key)
        assert.strictEqual('online', value)
        persisted = true
      }
      FakePersistence.publish = function (key, value) {
        assert.strictEqual('aaa', key)
        assert.deepStrictEqual(message, value)
        published = true
      }
      status.set({}, message)
      assert.ok(persisted)
      assert.ok(published)
    })

    it('offline', function () {
      var message = { key: 123, value: 'offline' }
      var persisted, published
      FakePersistence.persistHash = function (hash, key, value) {
        assert.strictEqual(123, key)
        assert.strictEqual('offline', value)
        persisted = true
      }
      FakePersistence.publish = function (key, value) {
        assert.strictEqual('aaa', key)
        assert.deepStrictEqual(message, value)
        published = true
      }
      status.set({}, message)
      assert.ok(persisted)
      assert.ok(published)
    })

    it('renews expiry for maxPersistence', function () {
      var message = { key: 123, value: 'online' }
      var expired
      FakePersistence.expire = function (hash, expiry) {
        assert.strictEqual('aaa', hash)
        assert.strictEqual(expiry, 12 * 60 * 60)
        expired = true
      }
      status.set({}, message)
      assert.ok(expired)
    })
  })

  describe('sync', function () {
    it('responds with a get message', function (done) {
      FakePersistence.readHashAll = function (key, callbackFn) {
        assert.strictEqual('aaa', key)
        callbackFn([1, 2])
      }

      status.sync({
        id: 123,
        send: function (msg) {
          // Check message
          assert.strictEqual('get', msg.op)
          assert.strictEqual('aaa', msg.to)
          assert.deepStrictEqual([1, 2], msg.value)
          done()
        }
      })
    })
    it('causes a subscription', function (done) {
      FakePersistence.readHashAll = function (key, callbackFn) {
        assert.strictEqual('aaa', key)
        callbackFn([1, 2])
      }

      status.sync({
        id: 123,
        send: function (msg) {
          assert.ok(status.subscribers[123])
          done()
        }
      })
    })
  })

  describe('maxPersistence', function () {
    it('defaults to 12 hours', function (done) {
      assert.strictEqual(status.options.policy.maxPersistence, 12 * 60 * 60)
      done()
    })

    it('can be overrided', function (done) {
      var options = {
        policy: {
          maxPersistence: 24 * 60 * 60
        }
      }

      var status = new Status('aaa', Radar, options)
      assert.strictEqual(status.options.policy.maxPersistence, 24 * 60 * 60)

      FakePersistence.expire = function (key, persistence) {
        assert.strictEqual(24 * 60 * 60, persistence)
        done()
      }
      status.set({}, { key: 123, value: 'online' })
    })
  })
})

describe('a status resource', function () {
  var radarServer

  describe('emitting messages', function () {
    beforeEach(function (done) {
      radarServer = Common.createRadarServer(done)
    })

    afterEach(function (done) {
      radarServer.terminate(done)
    })

    it('should emit incomming messages', function (done) {
      var subscribeMessage = { op: 'subscribe', to: 'status:/z1/test/ticket/1' }

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
      var subscribeMessage = { op: 'subscribe', to: 'status:/z1/test/ticket/1' }
      var setMessage = { op: 'set', to: 'status:/z1/test/ticket/1', value: { 1: 2 } }
      var socketOne = { id: 1, send: function (m) {} }
      var socketTwo = { id: 2, send: function (m) {} }

      radarServer.on('resource:new', function (resource) {
        resource.on('message:outgoing', function (message) {
          done()
        })
      })

      setTimeout(function () {
        radarServer._processMessage(socketOne, subscribeMessage)
        radarServer._processMessage(socketTwo, setMessage)
      }, 100)
    })

    // Case when setting status with the api
    describe('when not subscribed', function () {
      it('should emit outgoing messages', function (done) {
        var setMessage = { op: 'set', to: 'status:/z1/test/ticket/1', value: { 1: 2 } }
        var socketOne = { id: 1, send: function (m) {} }

        radarServer.on('resource:new', function (resource) {
          resource.on('message:outgoing', function (message) {
            done()
          })
        })

        setTimeout(function () {
          radarServer._processMessage(socketOne, setMessage)
        }, 100)
      })

      it('should unsubcribe (destroy resource) if there are no subscribers', function (done) {
        var to = 'status:/z1/test/ticket/1'
        var setMessage = { op: 'set', to: to, value: { 1: 2 } }
        var socketOne = { id: 1, send: function (m) {} }

        radarServer.on('resource:destroy', function (resource) {
          assert.strictEqual(radarServer.resources[to], resource)
          done()
        })

        setTimeout(function () {
          radarServer._processMessage(socketOne, setMessage)
        }, 100)
      })
    })
  })
})
