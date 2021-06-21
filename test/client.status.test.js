/* globals describe, it, beforeEach, before, after */

const common = require('./common.js')
const assert = require('assert')
const Tracker = require('callback_tracker')
let radar
let client
let client2

describe('When using status resources', function () {
  before(function (done) {
    const track = Tracker.create('before', done)

    radar = common.spawnRadar()
    radar.sendCommand('start', common.configuration, function () {
      client = common.getClient('dev', 123, 0, {}, track('client 1 ready'))
      client2 = common.getClient('dev', 246, 0, {}, track('client 2 ready'))
    })
  })

  after(function (done) {
    client.dealloc('test')
    client2.dealloc('test')
    common.stopRadar(radar, done)
  })

  beforeEach(function (done) {
    client.status('test').removeAllListeners()
    client2.status('test').removeAllListeners()

    const track = Tracker.create('before each', done)
    client.status('test').unsubscribe(track('client unsubscribe'))
    client2.status('test').unsubscribe(track('client2 unsubscribe'))
    common.startPersistence(track('redis cleanup'))
  })

  describe('subscribe/unsubscribe', function () {
    it('should subscribe successfully with ack', function (done) {
      client.status('test').subscribe(function (msg) {
        assert.strictEqual('subscribe', msg.op)
        assert.strictEqual('status:/dev/test', msg.to)
        done()
      })
    })

    it('should unsubscribe successfully with ack', function (done) {
      client.status('test').unsubscribe(function (msg) {
        assert.strictEqual('unsubscribe', msg.op)
        assert.strictEqual('status:/dev/test', msg.to)
        done()
      })
    })

    // Sending a message should only send to each subscriber, but only once
    it('should receive a message only once per subscriber', function (done) {
      const message = { state: 'test1' }
      const finished = {}

      function validate (msg, clientName) {
        assert.strictEqual('status:/dev/test', msg.to)
        assert.strictEqual('set', msg.op)
        assert.strictEqual(246, msg.key)
        assert.strictEqual(message.state, msg.value.state)
        assert.ok(!finished[clientName])
        finished[clientName] = true
        if (finished.client && finished.client2) {
          setTimeout(done, 30)
        }
      }

      client.status('test').on(function (msg) {
        validate(msg, 'client')
      })
      client2.status('test').on(function (msg) {
        validate(msg, 'client2')
      })

      client.status('test').subscribe()
      client2.status('test').subscribe().set(message)
    })

    it('can chain subscribe and on/once', function (done) {
      client.status('test').subscribe().once(function (message) {
        assert.strictEqual(246, message.key)
        assert.strictEqual('foo', message.value)
        done()
      })
      client2.status('test').set('foo')
    })

    it('should only receive message when subscribed', function (done) {
      // Send three messages, client2 will assert if it receieves any
      // Stop test when we receive all three at client 1

      const message = { state: 'test1' }
      const message2 = { state: 'test2' }
      const message3 = { state: 'test3' }

      client2.status('test').on(function (msg) {
        assert.ok(false)
      })

      client.status('test').on(function (msg) {
        if (msg.value.state === 'test3') {
          done()
        }
      })

      client.status('test').subscribe().set(message)
      client2.status('test').set(message2)
      client.status('test').set(message3)
    })

    it('should not receive messages after unsubscribe', function (done) {
      // Send two messages after client2 unsubscribes,
      // client2 will assert if it receives message 2 and 3
      // Stop test when we receive all three at client 1

      const message = { state: 'test1' }
      const message2 = { state: 'test2' }
      const message3 = { state: 'test3' }

      // test.numAssertions = 3
      client2.status('test').on(function (msg) {
        assert.strictEqual(msg.value.state, 'test1')
        client2.status('test').unsubscribe().set(message2)
        client2.status('test').unsubscribe().set(message3)
      })

      client.status('test').on(function (msg) {
        if (msg.value.state === 'test3') {
          // Received third message without asserting
          done()
        }
      })

      client2.status('test').subscribe().set(message)
      client.status('test').subscribe()
    })
  })

  describe('set', function () {
    it('can acknowledge a set', function (done) {
      client.status('test').set('foobar', function (message) {
        assert.strictEqual('set', message.op)
        assert.strictEqual('status:/dev/test', message.to)
        assert.strictEqual('foobar', message.value)
        assert.strictEqual(123, message.key)
        assert.deepStrictEqual({}, message.userData)
        assert.deepStrictEqual(0, message.type)
        done()
      })
    })
    it('can set a String', function (done) {
      client2.status('test').on(function (message) {
        assert.strictEqual('set', message.op)
        assert.strictEqual('status:/dev/test', message.to)
        assert.strictEqual('foo', message.value)
        assert.strictEqual(123, message.key)
        assert.deepStrictEqual({}, message.userData)
        assert.deepStrictEqual(0, message.type)
        done()
      }).subscribe(function () {
        client.status('test').set('foo')
      })
    })
    it('can set an Object', function (done) {
      client2.status('test').on(function (message) {
        assert.strictEqual('set', message.op)
        assert.strictEqual('status:/dev/test', message.to)
        assert.deepStrictEqual({ foo: 'bar' }, message.value)
        assert.strictEqual(123, message.key)
        assert.deepStrictEqual({}, message.userData)
        assert.deepStrictEqual(0, message.type)
        done()
      }).subscribe(function () {
        client.status('test').set({ foo: 'bar' })
      })
    })
  })

  describe('get', function () {
    it('can get a String', function (done) {
      const onceSet = function () {
        client.status('test').get(function (message) {
          assert.strictEqual('get', message.op)
          assert.strictEqual('status:/dev/test', message.to)
          assert.deepStrictEqual({ 123: 'foo' }, message.value)
          done()
        })
      }
      client.status('test').set('foo', onceSet)
    })

    it('can get an Object', function (done) {
      const onceSet = function () {
        client.status('test').get(function (message) {
          assert.strictEqual('get', message.op)
          assert.strictEqual('status:/dev/test', message.to)
          assert.deepStrictEqual({ 123: { hello: 'world' } }, message.value)
          done()
        })
      }
      client.status('test').set({ hello: 'world' }, onceSet)
    })

    it('returns {} if not set', function (done) {
      client.status('non-exist').get(function (message) {
        assert.strictEqual('get', message.op)
        assert.strictEqual('status:/dev/non-exist', message.to)
        assert.deepStrictEqual({}, message.value)
        done()
      })
    })
  })

  describe('sync', function () {
    it('calls back with the value, does not notify', function (done) {
      // Make sure redis message has reflected.
      client2.status('test').subscribe().set('foo').once(function () {
        client.status('test').on(function (message) {
          assert.ok(false)
        }).sync(function (message) {
          // Sync is implemented as subscribe + get, hence the return op is "get"
          assert.strictEqual('get', message.op)
          assert.deepStrictEqual({ 246: 'foo' }, message.value)
          setTimeout(done, 50)
        })
      })
    })
    it('also subscribes', function (done) {
      client.status('test').set('foo', function () {
        client.status('test').on(function (message) {
          assert.strictEqual('set', message.op)
          assert.strictEqual('status:/dev/test', message.to)
          assert.strictEqual('bar', message.value)
          assert.strictEqual(123, message.key)
          assert.deepStrictEqual({}, message.userData)
          assert.deepStrictEqual(0, message.type)
          done()
        }).sync(function (message) {
          // Sync is implemented as subscribe + get, hence the return op is "get"
          assert.strictEqual('get', message.op)
          assert.deepStrictEqual({ 123: 'foo' }, message.value)
          client.status('test').set('bar')
        })
      })
    })
    it('can sync a String', function (done) {
      client.status('test').set('foo', function () {
        client.status('test').sync(function (message) {
          // Sync is implemented as subscribe + get, hence the return op is "get"
          assert.strictEqual('get', message.op)
          assert.deepStrictEqual({ 123: 'foo' }, message.value)
          done()
        })
      })
    })
    it('can sync an Object', function (done) {
      client.status('test').set({ foo: 'bar' }, function () {
        client.status('test').sync(function (message) {
          // Sync is implemented as subscribe + get, hence the return op is "get"
          assert.strictEqual('get', message.op)
          assert.deepStrictEqual({ 123: { foo: 'bar' } }, message.value)
          done()
        })
      })
    })
    it('returns {} when not set', function (done) {
      client.status('test').sync(function (message) {
        // Sync is implemented as subscribe + get, hence the return op is "get"
        assert.strictEqual('get', message.op)
        assert.deepStrictEqual({}, message.value)
        done()
      })
    })
  })
})
