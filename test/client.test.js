/* globals describe, it, beforeEach */
const common = require('./common.js')
const assert = require('assert')
const ClientSession = require('../src/client/client_session.js')
const { EventEmitter } = require('events')
const sinon = require('sinon')
const proxyquire = require('proxyquire')

describe('ClientSession', function () {
  let clientSession
  let presences
  let subscriptions
  let transport

  beforeEach(function (done) {
    transport = new EventEmitter()
    transport.send = sinon.spy()
    common.startPersistence(done) // clean up
    clientSession = new ClientSession('joe', Math.random(), 'test', 1, transport)
    subscriptions = {}
    presences = {}
  })

  describe('state', function () {
    describe('_initialize', function () {
      it('sets state to ready', function () {
        const orig = clientSession.state.initialize
        clientSession.state.initialize = function () {
          clientSession.state.initialize.called = true
          return orig.call(clientSession.state)
        }

        clientSession._initialize()
        assert.ok(clientSession.state.initialize.called)
        assert.strictEqual(clientSession.state.state, 'ready')
      })
      it('updates lastModified', function () {
        const clock = sinon.useFakeTimers()

        try {
          clientSession = new ClientSession()
          assert.strictEqual(clientSession.lastModified, 0)

          clock.tick(100)
          clientSession._initialize()
          assert.strictEqual(clientSession.lastModified, 100)
        } finally {
          clock.restore()
        }
      })
      it('assigns object properties', function () {
        clientSession._initialize({
          name: 'abc',
          accountName: 'qwe'
        })

        assert.strictEqual(clientSession.name, 'abc')
        assert.strictEqual(clientSession.accountName, 'qwe')
        assert.strictEqual(clientSession.state.state, 'ready')
      })
    })
    describe('_initializeOnNameSync', function () {
      it('is called on transport message', function () {
        clientSession._initializeOnNameSync = sinon.spy()
        transport.emit('message', JSON.stringify({ op: 'nameSync' }))
        assert.ok(clientSession._initializeOnNameSync.called)
      })
      it('returns undefined when message op is not nameSync', function () {
        assert.strictEqual(clientSession._initializeOnNameSync({ op: 'foo' }), undefined)
      })
      it('proxies to _initialize', function () {
        clientSession._initialize = sinon.spy()

        transport.emit('message', JSON.stringify({
          op: 'nameSync',
          options: {
            association: { name: 'name' },
            clientVersion: 2.5
          },
          accountName: 'accountName'
        }))

        assert.ok(clientSession._initialize.calledWith({
          name: 'name',
          accountName: 'accountName',
          clientVersion: 2.5
        }))
      })
    })
    describe('end', function () {
      it('called when the underlying socket is closed', function () {
        const orig = clientSession.state.end
        clientSession.state.end = function () {
          clientSession.state.end.called = true
          return orig.call(clientSession.state)
        }
        clientSession.state.initialize()

        transport.emit('close')

        assert.ok(clientSession.state.end.called)
      })

      it('emits end event on end', function (done) {
        clientSession.on('end', function () {
          done()
        })
        clientSession.state.initialize()
        clientSession.state.end()
      })
    })
  })

  describe('message api', function () {
    describe('incoming', function () {
      it('emits transport message events if in ready state', function (done) {
        const originalMessage = { message: 'foo', op: 'blah' }
        clientSession.on('message', function (message) {
          done()
        })
        clientSession.state.initialize()
        transport.emit('message', JSON.stringify(originalMessage))
      })

      it('parses JSON to object', function (done) {
        const originalMessage = { message: 'foo', op: 'blah' }
        clientSession.on('message', function (message) {
          assert.deepStrictEqual(message, originalMessage)
          done()
        })
        clientSession.state.initialize()
        transport.emit('message', JSON.stringify(originalMessage))
      })
      it('does not emit transport message event if message is malformed', function (done) {
        const originalMessage = { bad: true }
        setTimeout(function () {
          done()
        }, 10)
        clientSession.on('message', function (message) {
          assert.fail('message should not be called')
        })

        transport.emit('message', JSON.stringify(originalMessage))
      })
      it('dispatches namesync', function () {
        const message = { op: 'nameSync', options: { association: { id: 1, name: 'one' } } }
        assert.strictEqual(clientSession.state.state, 'initializing')
        let called = 0
        const orig = clientSession._initializeOnNameSync
        clientSession._initializeOnNameSync = function () {
          called++
          orig.apply(this, arguments)
        }

        transport.emit('message', JSON.stringify(message))
        assert.strictEqual(called, 1)
      })
      it('dispatches namesync again after already initialized (multiple nameSync messages over session lifetime)', function () {
        const message = { op: 'nameSync', options: { association: { id: 1, name: 'one' } } }
        assert.strictEqual(clientSession.state.state, 'initializing')
        let called = 0
        const orig = clientSession._initializeOnNameSync
        clientSession._initializeOnNameSync = function () {
          called++
          orig.apply(this, arguments)
        }

        transport.emit('message', JSON.stringify(message))
        assert.strictEqual(called, 1)
        assert.strictEqual(clientSession.state.state, 'ready')
        transport.emit('message', JSON.stringify(message))
        assert.strictEqual(called, 2)
      })
    })
    describe('outgoing - .send', function () {
      it('calls transport.send', function () {
        const originalMessage = { message: 'bar' }

        clientSession.send(originalMessage)

        assert.ok(transport.send.called)
      })

      it('skips sending message if state is ended', function () {
        clientSession.state.end()

        clientSession.send({})

        assert.ok(!transport.send.called)
      })

      it('JSON stringifies message', function () {
        const originalMessage = { message: 'bar' }
        const expectedMessage = '{"message":"bar"}'

        clientSession.send(originalMessage)

        assert.ok(transport.send.calledWith(expectedMessage))
      })

      it('logs outgoing message', function () {
        function logging () { return logging }
        logging.info = sinon.spy()

        const ClientSession = proxyquire('../src/client/client_session.js', {
          minilog: logging
        })
        const id = Math.random()
        const clientSession = new ClientSession('joe', id, 'test', 1, transport)

        clientSession.send({ message: 'foo' })

        assert.ok(logging.info.calledWith('#socket.message.outgoing', id, '{"message":"foo"}'))
      })
    })
  })

  describe('.storeData and .loadData', function () {
    describe('subscriptions', function () {
      it('should store subscribe operations', function (done) {
        const to = 'presence:/test/account/ticket/1'
        const message = { to: to, op: 'subscribe' }

        subscriptions[to] = message

        clientSession.storeData(message)

        clientSession.readData(function (state) {
          assert.deepStrictEqual(state, {
            subscriptions: subscriptions,
            presences: {}
          })
          done()
        })
      })

      it('should store sync as subscribes', function (done) {
        const to = 'presence:/test/account/ticket/1'
        const message = { to: to, op: 'sync' }

        subscriptions[to] = message

        clientSession.storeData(message)

        clientSession.readData(function (state) {
          assert.deepStrictEqual(state, {
            subscriptions: subscriptions,
            presences: {}
          })
          done()
        })
      })

      it('should remove subscriptions on unsubscribe', function (done) {
        const to = 'presence:/test/account/ticket/1'
        const subscribe = { to: to, op: 'subscribe' }
        const unsubscribe = { to: to, op: 'unsubscribe' }

        clientSession.storeData(subscribe)
        clientSession.storeData(unsubscribe)

        clientSession.readData(function (state) {
          assert.deepStrictEqual(state, {
            subscriptions: {},
            presences: {}
          })
          done()
        })
      })

      it('sync after subscribe, keeps the sync', function (done) {
        const to = 'presence:/test/account/ticket/1'
        const subscribe = { to: to, op: 'subscribe' }
        const sync = { to: to, op: 'sync' }

        clientSession.storeData(subscribe)
        clientSession.storeData(sync)

        subscriptions[to] = sync

        clientSession.readData(function (state) {
          assert.deepStrictEqual(state, {
            subscriptions: subscriptions,
            presences: {}
          })
          done()
        })
      })

      it('subscribe after sync, keeps the sync', function (done) {
        const to = 'presence:/test/account/ticket/1'
        const subscribe = { to: to, op: 'subscribe' }
        const sync = { to: to, op: 'sync' }

        clientSession.storeData(sync)
        clientSession.storeData(subscribe)

        subscriptions[to] = sync

        clientSession.readData(function (state) {
          assert.deepStrictEqual(state, {
            subscriptions: subscriptions,
            presences: {}
          })
          done()
        })
      })
    })

    describe('presences', function () {
      it('should store set online operations', function (done) {
        const to = 'presence:/test/account/ticket/1'
        const message = { to: to, op: 'set', value: 'online' }

        clientSession.storeData(message)

        delete message.value
        presences[to] = message

        clientSession.readData(function (state) {
          assert.deepStrictEqual(state, {
            subscriptions: {},
            presences: presences
          })
          done()
        })
      })

      it('should remove presence when set offline', function (done) {
        const to = 'presence:/test/account/ticket/1'
        const online = { to: to, op: 'set', value: 'online' }
        const offline = { to: to, op: 'set', value: 'offline' }

        clientSession.storeData(online)
        clientSession.storeData(offline)

        clientSession.readData(function (state) {
          assert.deepStrictEqual(state, {
            subscriptions: {},
            presences: {}
          })
          done()
        })
      })
    })
  })
})
