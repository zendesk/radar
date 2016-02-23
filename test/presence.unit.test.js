/* globals describe, it, beforeEach, afterEach, before, after */
var assert = require('assert')
var MiniEE = require('miniee')
var Persistence = require('persistence')
var Common = require('./common.js')
var Presence = require('../src/core/resources/presence')
var sinon = require('sinon')
var expect = require('chai').expect

describe('given a presence resource', function () {
  var presence, client, client2
  var oldExpire = Persistence.expire
  var oldPersistHash = Persistence.persistHash
  var oldPublish = Persistence.publish

  var Server = {
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
      var published
      Persistence.publish = function (scope, m, callback) {
        assert.equal(1, m.userId)
        assert.equal(2, m.userType)
        assert.equal(true, m.online)
        assert.equal(undefined, m.clientData)
        presence.redisIn(m)
        published = true
      }
      presence.set(client, { key: 1, type: 2, value: 'online' })
      assert.ok(presence.manager.hasUser(1))
      assert.ok(published)
    })

    it('can be set offline', function () {
      var published
      Persistence.publish = function (scope, m) {
        presence.redisIn(m)
      }
      presence.set(client, {key: 1, type: 2, value: 'online'})
      assert.ok(presence.manager.hasUser(1))
      Persistence.publish = function (scope, m) {
        assert.equal(1, m.userId)
        assert.equal(2, m.userType)
        assert.equal(false, m.online)
        published = true
        presence.redisIn(m)
      }
      presence.set(client, { key: 1, type: 2, value: 'offline' })
      assert.ok(!presence.manager.hasUser(1))
      assert.ok(published)
    })

    it('can be set to online and include arbitrary client data', function () {
      var published
      var clientData = { 'abc': 'abc' }

      Persistence.publish = function (scope, m) {
        assert.equal(1, m.userId)
        assert.equal(2, m.userType)
        assert.equal(true, m.online)
        assert.equal(clientData, m.clientData)
        published = true
        presence.redisIn(m)
      }
      presence.set(client, {key: 1, type: 2, value: 'online', clientData: clientData})
      assert.ok(presence.manager.hasUser(1))
      assert.ok(published)
    })

    it('expires within maxPersistence if set', function (done) {
      Persistence.expire = function (scope, expiry) {
        assert.equal(presence.to, scope)
        assert.equal(expiry, 12 * 60 * 60)
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
      var calls = 0
      Persistence.publish = function (scope, m) {
        var online = m.online
        var userId = m.userId
        var userType = m.userType

        assert.equal(1, userId)
        assert.equal(2, userType)
        assert.equal(true, online)
        calls++
        presence.redisIn(m)
      }
      presence.set(client, { key: 1, type: 2, value: 'online' })
      presence.set(client, { key: 1, type: 2, value: 'online' })

      // Persist twice, but only update once
      assert.equal(2, calls)
      assert.ok(presence.manager.hasUser(1))
    })
  })

  describe('.sync', function () {
    it('message v2 sends get response + subscribes', function (done) {
      var called = {}
      var socket = {
        send: function (message) {
          called[message.op] = message
        }
      }
      presence.fullRead = function (fn) { fn() }
      presence.subscribe = function () {
        called.subscribe = true
      }
      presence.sync(socket, {op: 'sync', options: {version: '2'}})

      setImmediate(function () {
        assert.ok(called.get)
        assert.ok(called.subscribe)
        done()
      })
    })
    it('message v2 version can be a string or a number', function (done) {
      var sent = []
      var socket = {
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

      presence.sync(socket, {op: 'sync', options: {version: '2'}})
      function check () {
        if (sent.length === 1) {
          presence.sync(socket, {op: 'sync', options: {version: 2}})
        } else {
          assert.ok(sent.length === 2 && sent[0] === 'get' && sent[1] === 'get')
          done()
        }
      }
    })
    it('message v1 sends online response + subscribes', function (done) {
      var called = {}
      var socket = {
        send: function (message) {
          called[message.op] = message
        }
      }
      presence.fullRead = function (fn) { fn() }
      presence.subscribe = function () {
        called.subscribe = true
      }
      // version 1 does not specify options.version
      presence.sync(socket, {op: 'sync'})

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
        var client_online_called = false

        Persistence.publish = function (scope, m) {
          // 10ms delay
          setTimeout(function () {
            presence.redisIn(m)
          }, 10)
        }

        presence.set(client, { key: 1, type: 2, value: 'online' })
        presence.unsubscribe(client)
        presence.manager.once('client_online', function () {
          client_online_called = true
        })
        presence.manager.once('client_offline', function () {
          assert.ok(client_online_called)
          done()
        })
      })

      it('should get added to user expiry timer, no duplicates', function (done) {
        Persistence.publish = function (scope, m) {
          presence.redisIn(m)
        }

        presence.set(client, { key: 1, type: 2, value: 'online' })

        assert.ok(!presence.manager.expiryTimers[1])
        assert.equal(Object.keys(presence.manager.expiryTimers).length, 0)
        presence.unsubscribe(client)
        // userExpiry timer is added
        assert.ok(presence.manager.expiryTimers[1])

        // Active
        assert.ok(presence.manager.expiryTimers[1]._idleTimeout > 0)
        assert.equal(Object.keys(presence.manager.expiryTimers).length, 1)

        presence.set(client2, { key: 1, type: 2, value: 'online' })
        presence.unsubscribe(client2)
        // No duplicates
        assert.ok(presence.manager.expiryTimers[1])

        // Active
        assert.ok(presence.manager.expiryTimers[1]._idleTimeout > 0)
        assert.equal(Object.keys(presence.manager.expiryTimers).length, 1)

        done()
      })

      it('must broadcast offline for users except reconnecting users', function () {
        Persistence.publish = function (scope, m) {
          presence.redisIn(m)
        }
        presence.set(client, { key: 1, type: 2, value: 'online' })

        assert.ok(!presence.manager.expiryTimers[1])
        assert.equal(Object.keys(presence.manager.expiryTimers).length, 0)
        presence.unsubscribe(client)

        // Disconnect is queued; userExpiry timer is added
        assert.ok(presence.manager.expiryTimers[1])

        // Active
        assert.ok(presence.manager.expiryTimers[1]._idleTimeout > 0)
        assert.equal(Object.keys(presence.manager.expiryTimers).length, 1)

        presence.set(client2, { key: 123, type: 0, value: 'online' })
        presence.unsubscribe(client2)
        // userExpiry timer is added
        assert.ok(presence.manager.expiryTimers[123])

        // Active
        assert.ok(presence.manager.expiryTimers[123]._idleTimeout > 0)
        assert.equal(Object.keys(presence.manager.expiryTimers).length, 2)

        var remote = []
        var local = []
        Persistence.publish = function (scope, data) {
          remote.push(data)
          presence.redisIn(data)
        }
        var oldBroadcast = presence.broadcast
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
        assert.deepEqual(local[1], { to: 'aaa', op: 'offline', value: { '123': 0 } })

        presence.broadcast = oldBroadcast
      })
    })
    describe('when two connections have the same user', function () {
      var remote, local, oldBroadcast, messages

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

        assert.equal(remote.length, 1)
        // A client_offline should be sent for CID 1

        // Remove stamp, it makes no sense to test those
        delete remote[0].stamp

        assert.deepEqual(remote[0], { userId: 1,
          userType: 2,
          clientId: client.id,
          online: false,
          explicit: true
        })

        presence.set(client2, { key: 1, type: 2, value: 'offline' })

        // Remove stamp, it makes no sense to test those
        delete remote[1].stamp

        // There should be a client_offline notification for CID 2
        assert.equal(remote.length, 2)

        assert.deepEqual(remote[1], { userId: 1,
          userType: 2,
          clientId: client2.id,
          online: false,
          explicit: true
        })

        // Remove stamp, it makes no sense to test those
        delete local[0].stamp
        // Check local broadcast
        assert.equal(local.length, 3)
        // There should be a client_offline notification for CID 1
        assert.deepEqual(local[0], { to: 'aaa',
          op: 'client_offline',
          explicit: true,
          value: { userId: 1, clientId: client.id }
        })

        // Remove stamp, it makes no sense to test those
        delete local[1].stamp
        // There should be a client_offline notification for CID 2
        assert.deepEqual(local[1], { to: 'aaa',
          op: 'client_offline',
          explicit: true,
          value: { userId: 1, clientId: client2.id }
        })
        // There should be a broadcast for a offline notification for UID 1
        // Remove stamp, it makes no sense to test those
        delete local[2].stamp
        assert.deepEqual(local[2], { to: 'aaa', op: 'offline', value: { 1: 2 } })
        assert.deepEqual(local[2].value, { 1: 2 })

        // No notifications sent to the client themselves.
        assert.equal(typeof messages[client.id], 'undefined')
        assert.equal(typeof messages[client2.id], 'undefined')
      })

      it('should emit a user disconnect only after both disconnect (both implicit)', function () {
        presence.unsubscribe(client)

        assert.equal(remote.length, 1)
        // A client_offline should be sent for CID 1
        assert.equal(remote[0].online, false)
        assert.equal(remote[0].userId, 1)
        assert.equal(remote[0].clientId, client.id)

        presence.unsubscribe(client2)

        assert.equal(remote.length, 2)
        // There should be a client_offline notification for CID 2
        assert.equal(remote[1].userId, 1)
        assert.equal(remote[1].clientId, client2.id)
        assert.equal(remote[1].online, false)

        // Check local broadcast
        assert.equal(local.length, 2)
        // There should be a client_offline notification for CID 1
        assert.equal(local[0].op, 'client_offline')
        assert.equal(local[0].value.userId, 1)
        assert.equal(local[0].value.clientId, client.id)
        // There should be a client_offline notification for CID 2
        assert.equal(local[1].op, 'client_offline')
        assert.equal(local[1].value.userId, 1)
        assert.equal(local[1].value.clientId, client2.id)

        // Manually expire the timer
        presence.manager.expiryTimers[1]._onTimeout()
        clearTimeout(presence.manager.expiryTimers[1])

        // There should be a broadcast for a offline notification for UID 1
        assert.equal(local.length, 3)
        assert.equal(local[2].op, 'offline')
        assert.deepEqual(local[2].value, { 1: 2 })

        // No notifications sent to the client themselves.
        assert.equal(typeof messages[client.id], 'undefined')
        assert.equal(typeof messages[client2.id], 'undefined')
      })

      it('should emit a user disconnect only after both disconnect (one implicit, other explicit)', function () {
        presence.unsubscribe(client)

        assert.equal(remote.length, 1)
        // A client_offline should be sent for CID 1
        assert.equal(remote[0].online, false)
        assert.equal(remote[0].userId, 1)
        assert.equal(remote[0].clientId, client.id)

        presence.set(client2, { key: 1, type: 2, value: 'offline' })

        // Check local broadcast
        assert.equal(local.length, 2)
        // There should be a client_offline notification for CID 1
        assert.equal(local[0].op, 'client_offline')
        assert.equal(local[0].value.userId, 1)
        assert.equal(local[0].value.clientId, client.id)
        // There should be a client_offline notification for CID 2
        assert.equal(local[1].op, 'client_offline')
        assert.equal(local[1].value.userId, 1)
        assert.equal(local[1].value.clientId, client2.id)

        // Manually expire the timer
        presence.manager.expiryTimers[1]._onTimeout()
        clearTimeout(presence.manager.expiryTimers[1])

        // There should be a broadcast for a offline notification for UID 1
        assert.equal(local.length, 3)
        assert.equal(local[2].op, 'offline')
        assert.deepEqual(local[2].value, { 1: 2 })

        // No notifications sent to the client themselves.
        assert.equal(typeof messages[client.id], 'undefined')
        assert.equal(typeof messages[client2.id], 'undefined')
      })
    })
  })

  describe('userData', function () {
    it('userData should be stored on an incoming message', function () {
      var persistHash = Persistence.persistHash
      var called = false

      Persistence.persistHash = function (to, key, value) {
        called = true
        assert.deepEqual(value.userData, { test: 1 })
      }

      presence.set(client, { type: 2, key: 123, value: 'online', userData: { test: 1 } })

      assert.ok(called)
      Persistence.persistHash = persistHash
    })

    it('userData should be included as the value of a client in a presence response', function () {
      var data = {
        clients: {},
        userType: 2
      }
      var fakeClient = {
        send: function (msg) {
          assert.deepEqual(msg.value[123], data)
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
    var radarServer

    beforeEach(function (done) {
      radarServer = Common.createRadarServer(done)
    })

    afterEach(function (done) {
      radarServer.terminate(done)
    })

    it('should emit incomming messages', function (done) {
      var subscribeMessage = { op: 'subscribe', to: 'presence:/z1/test/ticket/1' }

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
      var count = 0
      var setMessage = { op: 'set', to: 'presence:/z1/test/ticket/1', value: 'online' }
      var subscribeMessage = { op: 'subscribe', to: 'presence:/z1/test/ticket/1' }
      var socketOne = { id: 1, send: function (m) {} }
      var socketTwo = { id: 2, send: function (m) {} }

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
  })
})
