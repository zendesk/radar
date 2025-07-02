/* globals describe, it, beforeEach, afterEach, before, after */
const assert = require('assert')
const MiniEE = require('miniee')
const Persistence = require('persistence')
const Common = require('./common.js')
const Presence = require('../src/core/resources/presence')
const sinon = require('sinon')
const { expect } = require('chai')
const common = require('./common.js')

describe('given a presence resource', function () {
  let presence, client, client2
  const oldExpire = Persistence.expire
  const oldPersistHash = Persistence.persistHash
  const oldPublish = Persistence.publish

  const Server = {
    broadcast: function () {},
    terminate: function () {},
    destroyResource: function () {},
    socketServer: {
      clients: { }
    },
    sentry: {
      start: function (opts, cb) { cb() },
      on: function () {},
      stop: function () {},
      isDown: sinon.stub().returns(false)
    }
  }

  before(function (done) {
    Common.startPersistence(done)
  })

  beforeEach(function (done) {
    Persistence.delWildCard('*', function () {
      presence = new Presence('aaa', Server, {})
      client = new MiniEE()
      client.send = function () {}
      client.id = 1001
      client2 = new MiniEE()
      client2.id = 1002
      client2.send = function () {}
      Server.channels = { }
      Server.channels[presence.to] = presence
      presence.sentry.start({}, function () {
        done()
      })
    })
  })

  afterEach(function () {
    Persistence.expire = oldExpire
    Persistence.publish = oldPublish
    Persistence.persistHash = oldPersistHash
  })

  after(function (done) {
    Common.endPersistence(done)
  })

  describe('.set', function () {
    it('can be set online', function () {
      let published
      Persistence.publish = function (scope, m, callbackFn) {
        assert.strictEqual(1, m.userId)
        assert.strictEqual(2, m.userType)
        assert.strictEqual(true, m.online)
        assert.strictEqual(undefined, m.clientData)
        presence.redisIn(m)
        published = true
      }
      presence.set(client, { key: 1, type: 2, value: 'online' })
      assert.ok(presence.manager.hasUser(1))
      assert.ok(published)
    })

    it('can be set offline', function () {
      let published
      Persistence.publish = function (scope, m) {
        presence.redisIn(m)
      }
      presence.set(client, { key: 1, type: 2, value: 'online' })
      assert.ok(presence.manager.hasUser(1))
      Persistence.publish = function (scope, m) {
        assert.strictEqual(1, m.userId)
        assert.strictEqual(2, m.userType)
        assert.strictEqual(false, m.online)
        published = true
        presence.redisIn(m)
      }
      presence.set(client, { key: 1, type: 2, value: 'offline' })
      assert.ok(!presence.manager.hasUser(1))
      assert.ok(published)
    })

    it('can be set to online and include arbitrary client data', function () {
      let published
      const clientData = { abc: 'abc' }

      Persistence.publish = function (scope, m) {
        assert.strictEqual(1, m.userId)
        assert.strictEqual(2, m.userType)
        assert.strictEqual(true, m.online)
        assert.strictEqual(clientData, m.clientData)
        published = true
        presence.redisIn(m)
      }
      presence.set(client, { key: 1, type: 2, value: 'online', clientData: clientData })
      assert.ok(presence.manager.hasUser(1))
      assert.ok(published)
    })

    it('expires within maxPersistence if set', function (done) {
      Persistence.expire = function (scope, expiry) {
        assert.strictEqual(presence.to, scope)
        assert.strictEqual(expiry, 12 * 60 * 60)
        done()
      }

      presence.set(client, { key: 1, type: 2, value: 'online' })
    })

    it('also subscribes, if set online', function () {
      presence.set(client, { key: 1, type: 2, value: 'online' })
      assert.ok(presence.subscribers[client.id])
    })

    it('setting twice does not cause duplicate notifications', function () {
      // See also: presence_monitor.test.js / test with the same name
      let calls = 0
      Persistence.publish = function (scope, m) {
        const online = m.online
        const userId = m.userId
        const userType = m.userType

        assert.strictEqual(1, userId)
        assert.strictEqual(2, userType)
        assert.strictEqual(true, online)
        calls++
        presence.redisIn(m)
      }
      presence.set(client, { key: 1, type: 2, value: 'online' })
      presence.set(client, { key: 1, type: 2, value: 'online' })

      // Persist twice, but only update once
      assert.strictEqual(2, calls)
      assert.ok(presence.manager.hasUser(1))
    })
  })

  describe('.sync', function () {
    it('message v2 sends get response + subscribes', function (done) {
      const called = {}
      const socket = {
        send: function (message) {
          called[message.op] = message
        }
      }
      presence.fullRead = function (fn) { fn() }
      presence.subscribe = function () {
        called.subscribe = true
      }
      presence.sync(socket, { op: 'sync', options: { version: '2' } })

      setImmediate(function () {
        assert.ok(called.get)
        assert.ok(called.subscribe)
        done()
      })
    })
    it('message v2 version can be a string or a number', function (done) {
      const sent = []
      const socket = {
        send: function (message) {
          sent.push(message.op)
        }
      }

      // override to make sync
      presence.fullRead = function (fn) {
        fn()
        check()
      }

      presence.subscribe = function () {}

      presence.sync(socket, { op: 'sync', options: { version: '2' } })
      function check () {
        if (sent.length === 1) {
          presence.sync(socket, { op: 'sync', options: { version: 2 } })
        } else {
          assert.ok(sent.length === 2 && sent[0] === 'get' && sent[1] === 'get')
          done()
        }
      }
    })
    it('message v1 sends online response + subscribes', function (done) {
      const called = {}
      const socket = {
        send: function (message) {
          called[message.op] = message
        }
      }
      presence.fullRead = function (fn) { fn() }
      presence.subscribe = function () {
        called.subscribe = true
      }
      // version 1 does not specify options.version
      presence.sync(socket, { op: 'sync' })

      setImmediate(function () {
        assert.ok(called.online)
        assert.ok(called.subscribe)
        done()
      })
    })
  })

  describe('user disconnects', function () {
    describe('when implicit', function () {
      it('should notify correctly even if redis has not replied to set(online) yet', function (done) {
        let clientOnlineCalled = false

        Persistence.publish = function (scope, m) {
          // 10ms delay
          setTimeout(function () {
            presence.redisIn(m)
          }, 10)
        }

        presence.set(client, { key: 1, type: 2, value: 'online' })
        presence.unsubscribe(client)
        presence.manager.once('client_online', function () {
          clientOnlineCalled = true
        })
        presence.manager.once('client_offline', function () {
          assert.ok(clientOnlineCalled)
          done()
        })
      })

      it('should get added to user expiry timer, no duplicates', function (done) {
        Persistence.publish = function (scope, m) {
          presence.redisIn(m)
        }

        presence.set(client, { key: 1, type: 2, value: 'online' })

        assert.ok(!presence.manager.expiryTimers[1])
        assert.strictEqual(Object.keys(presence.manager.expiryTimers).length, 0)
        presence.unsubscribe(client)
        // userExpiry timer is added
        assert.ok(presence.manager.expiryTimers[1])

        // Active
        assert.ok(presence.manager.expiryTimers[1]._idleTimeout > 0)
        assert.strictEqual(Object.keys(presence.manager.expiryTimers).length, 1)

        presence.set(client2, { key: 1, type: 2, value: 'online' })
        presence.unsubscribe(client2)
        // No duplicates
        assert.ok(presence.manager.expiryTimers[1])

        // Active
        assert.ok(presence.manager.expiryTimers[1]._idleTimeout > 0)
        assert.strictEqual(Object.keys(presence.manager.expiryTimers).length, 1)

        done()
      })

      it('must broadcast offline for users except reconnecting users', function () {
        Persistence.publish = function (scope, m) {
          presence.redisIn(m)
        }
        presence.set(client, { key: 1, type: 2, value: 'online' })

        assert.ok(!presence.manager.expiryTimers[1])
        assert.strictEqual(Object.keys(presence.manager.expiryTimers).length, 0)
        presence.unsubscribe(client)

        // Disconnect is queued; userExpiry timer is added
        assert.ok(presence.manager.expiryTimers[1])

        // Active
        assert.ok(presence.manager.expiryTimers[1]._idleTimeout > 0)
        assert.strictEqual(Object.keys(presence.manager.expiryTimers).length, 1)

        presence.set(client2, { key: 123, type: 0, value: 'online' })
        presence.unsubscribe(client2)
        // userExpiry timer is added
        assert.ok(presence.manager.expiryTimers[123])

        // Active
        assert.ok(presence.manager.expiryTimers[123]._idleTimeout > 0)
        assert.strictEqual(Object.keys(presence.manager.expiryTimers).length, 2)

        const remote = []
        const local = []
        Persistence.publish = function (scope, data) {
          remote.push(data)
          presence.redisIn(data)
        }
        const oldBroadcast = presence.broadcast
        presence.broadcast = function (data) {
          local.push(data)
        }
        // Now client 1 reconnects
        presence.set(client, { key: 1, type: 2, value: 'online' })
        // client 1 should emit periodic online and 123 should have emitted offline
        // one autopublish message
        assert.ok(remote.some(function (msg) { return msg.userId === 1 && msg.userType === 2 && msg.online }))
        // Timer is cleared
        assert.ok(!presence.manager.expiryTimers[1])

        // Invoke the timer fn manually:
        presence.manager.expiryTimers[123]._onTimeout()
        clearTimeout(presence.manager.expiryTimers[123])

        // One broadcast of a user offline
        // First message is client_online for user 1
        assert.deepStrictEqual(common.normalize(local[1]), common.normalize({ to: 'aaa', op: 'offline', value: { 123: 0 } }))

        presence.broadcast = oldBroadcast
      })
    })
    describe('when two connections have the same user', function () {
      let remote, local, oldBroadcast, messages

      beforeEach(function () {
        Persistence.publish = function (scope, m) {
          presence.redisIn(m)
        }
        presence.set(client, { key: 1, type: 2, value: 'online' })
        presence.set(client2, { key: 1, type: 2, value: 'online' })

        remote = []
        local = []
        Persistence.publish = function (scope, data) {
          remote.push(data)
          presence.redisIn(data)
        }

        oldBroadcast = presence.broadcast
        presence.broadcast = function (data, except) {
          oldBroadcast.call(presence, data, except)
          local.push(data)
        }

        Server.socketServer.clients[client.id] = client
        Server.socketServer.clients[client2.id] = client2
        messages = {}
        client.send = function (msg) {
          (messages[client.id] || (messages[client.id] = [])).push(msg)
        }
        client2.send = function (msg) {
          (messages[client2.id] || (messages[client2.id] = [])).push(msg)
        }
      })

      afterEach(function () {
        presence.broadcast = oldBroadcast
      })

      it('should emit a user disconnect only after both disconnect (both explicit)', function () {
        presence.set(client, { key: 1, type: 2, value: 'offline' })

        assert.strictEqual(remote.length, 1)
        // A client_offline should be sent for CID 1

        // Remove stamp, it makes no sense to test those
        delete remote[0].stamp

        assert.deepStrictEqual(common.normalize(remote[0]),
          common.normalize({
            userId: 1,
            userType: 2,
            clientId: client.id,
            online: false,
            explicit: true
          }))

        presence.set(client2, { key: 1, type: 2, value: 'offline' })

        // Remove stamp, it makes no sense to test those
        delete remote[1].stamp

        // There should be a client_offline notification for CID 2
        assert.strictEqual(remote.length, 2)

        assert.deepStrictEqual(common.normalize(remote[1]),
          common.normalize({
            userId: 1,
            userType: 2,
            clientId: client2.id,
            online: false,
            explicit: true
          }))

        // Remove stamp, it makes no sense to test those
        delete local[0].stamp
        // Check local broadcast
        assert.strictEqual(local.length, 3)
        // There should be a client_offline notification for CID 1
        assert.deepStrictEqual(common.normalize(local[0]),
          common.normalize({
            to: 'aaa',
            op: 'client_offline',
            explicit: true,
            value: { userId: 1, clientId: client.id }
          }))

        // Remove stamp, it makes no sense to test those
        delete local[1].stamp
        // There should be a client_offline notification for CID 2
        assert.deepStrictEqual(common.normalize(local[1]),
          common.normalize({
            to: 'aaa',
            op: 'client_offline',
            explicit: true,
            value: { userId: 1, clientId: client2.id }
          }))
        // There should be a broadcast for a offline notification for UID 1
        // Remove stamp, it makes no sense to test those
        delete local[2].stamp
        assert.deepStrictEqual(common.normalize(local[2]), common.normalize({ to: 'aaa', op: 'offline', value: { 1: 2 } }))
        assert.deepStrictEqual(common.normalize(local[2].value), common.normalize({ 1: 2 }))

        // No notifications sent to the client themselves.
        assert.strictEqual(typeof messages[client.id], 'undefined')
        assert.strictEqual(typeof messages[client2.id], 'undefined')
      })

      it('should emit a user disconnect only after both disconnect (both implicit)', function () {
        presence.unsubscribe(client)

        assert.strictEqual(remote.length, 1)
        // A client_offline should be sent for CID 1
        assert.strictEqual(remote[0].online, false)
        assert.strictEqual(remote[0].userId, 1)
        assert.strictEqual(remote[0].clientId, client.id)

        presence.unsubscribe(client2)

        assert.strictEqual(remote.length, 2)
        // There should be a client_offline notification for CID 2
        assert.strictEqual(remote[1].userId, 1)
        assert.strictEqual(remote[1].clientId, client2.id)
        assert.strictEqual(remote[1].online, false)

        // Check local broadcast
        assert.strictEqual(local.length, 2)
        // There should be a client_offline notification for CID 1
        assert.strictEqual(local[0].op, 'client_offline')
        assert.strictEqual(local[0].value.userId, 1)
        assert.strictEqual(local[0].value.clientId, client.id)
        // There should be a client_offline notification for CID 2
        assert.strictEqual(local[1].op, 'client_offline')
        assert.strictEqual(local[1].value.userId, 1)
        assert.strictEqual(local[1].value.clientId, client2.id)

        // Manually expire the timer
        presence.manager.expiryTimers[1]._onTimeout()
        clearTimeout(presence.manager.expiryTimers[1])

        // There should be a broadcast for a offline notification for UID 1
        assert.strictEqual(local.length, 3)
        assert.strictEqual(local[2].op, 'offline')
        assert.deepStrictEqual(common.normalize(local[2].value), common.normalize({ 1: 2 }))

        // No notifications sent to the client themselves.
        assert.strictEqual(typeof messages[client.id], 'undefined')
        assert.strictEqual(typeof messages[client2.id], 'undefined')
      })

      it('should emit a user disconnect only after both disconnect (one implicit, other explicit)', function () {
        presence.unsubscribe(client)

        assert.strictEqual(remote.length, 1)
        // A client_offline should be sent for CID 1
        assert.strictEqual(remote[0].online, false)
        assert.strictEqual(remote[0].userId, 1)
        assert.strictEqual(remote[0].clientId, client.id)

        presence.set(client2, { key: 1, type: 2, value: 'offline' })

        // Check local broadcast
        assert.strictEqual(local.length, 2)
        // There should be a client_offline notification for CID 1
        assert.strictEqual(local[0].op, 'client_offline')
        assert.strictEqual(local[0].value.userId, 1)
        assert.strictEqual(local[0].value.clientId, client.id)
        // There should be a client_offline notification for CID 2
        assert.strictEqual(local[1].op, 'client_offline')
        assert.strictEqual(local[1].value.userId, 1)
        assert.strictEqual(local[1].value.clientId, client2.id)

        // Manually expire the timer
        presence.manager.expiryTimers[1]._onTimeout()
        clearTimeout(presence.manager.expiryTimers[1])

        // There should be a broadcast for a offline notification for UID 1
        assert.strictEqual(local.length, 3)
        assert.strictEqual(local[2].op, 'offline')
        assert.deepStrictEqual(common.normalize(local[2].value), common.normalize({ 1: 2 }))

        // No notifications sent to the client themselves.
        assert.strictEqual(typeof messages[client.id], 'undefined')
        assert.strictEqual(typeof messages[client2.id], 'undefined')
      })
    })
  })

  describe('userData', function () {
    it('userData should be stored on an incoming message', function () {
      const persistHash = Persistence.persistHash
      let called = false

      Persistence.persistHash = function (to, key, value) {
        called = true
        assert.deepStrictEqual(common.normalize(value.userData), common.normalize({ test: 1 }))
      }

      presence.set(client, { type: 2, key: 123, value: 'online', userData: { test: 1 } })

      assert.ok(called)
      Persistence.persistHash = persistHash
    })

    it('userData should be included as the value of a client in a presence response', function () {
      const data = {
        clients: {},
        userType: 2
      }
      const fakeClient = {
        send: function (msg) {
          assert.deepStrictEqual(common.normalize(msg.value[123]), common.normalize(data))
        }
      }

      data.clients[client.id] = { test: 1 }

      presence.set(client, { type: 2, key: 123, value: 'online', userData: { test: 1 } })
      presence.get(fakeClient, { options: { version: 2 } })
    })
  })

  describe('#destroy()', function () {
    it('sets resource.destroyed flag to true', function () {
      expect(!presence.destroyed).to.equal(true)
      presence.destroy()
      expect(presence.destroyed).to.equal(true)
    })
  })
})

describe('a presence resource', function () {
  describe('emitting messages', function () {
    let radarServer

    beforeEach(function (done) {
      radarServer = Common.createRadarServer(done)
    })

    afterEach(function (done) {
      radarServer.terminate(done)
    })

    it('should emit incomming messages', function (done) {
      const subscribeMessage = { op: 'subscribe', to: 'presence:/z1/test/ticket/1' }

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
      let count = 0
      const setMessage = { op: 'set', to: 'presence:/z1/test/ticket/1', value: 'online' }
      const subscribeMessage = { op: 'subscribe', to: 'presence:/z1/test/ticket/1' }
      const socketOne = { id: 1, send: function (m) {} }
      const socketTwo = { id: 2, send: function (m) {} }

      radarServer.on('resource:new', function (resource) {
        resource.on('message:outgoing', function (message) {
          count++
          if (count === 2) { done() }
        })
      })

      setTimeout(function () {
        radarServer._processMessage(socketOne, subscribeMessage)
        radarServer._processMessage(socketTwo, setMessage)
      }, 100)
    })

    it('should not allow prototype pollution via set message', function (done) {
    // This message tries to pollute Object.prototype
      let count = 0
      const setMessage = {
        op: 'set',
        to: 'presence:/z1/test/ticket/1',
        value: 'online',
        key: '__proto__',
        type: { polluted: true }
      }
      const socketTwo = { id: 'polluter', send: function () {} }

      radarServer.on('resource:new', function (resource) {
        resource.on('message:outgoing', function (message) {
        // After processing, check if global Object.prototype is polluted
          const obj = {}
          // If prototype pollution happened, obj.polluted would be true
          assert.strictEqual(obj.polluter, undefined, 'Prototype pollution detected!')
          count++
          if (count === 2) { done() }
        })
      })

      setTimeout(function () {
        radarServer._processMessage(socketTwo, setMessage)
      }, 100)
    })
  })
})
