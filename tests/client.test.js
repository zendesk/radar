/* globals describe, it, beforeEach */
var common = require('./common.js')
var assert = require('assert')
var ClientSession = require('../client/client_session.js')
var EventEmitter = require('events').EventEmitter
var sinon = require('sinon')

describe('ClientSession', function () {
  var clientSession
  var presences
  var subscriptions
  var transport = new EventEmitter()
  transport.send = sinon.spy()

  beforeEach(function (done) {
    common.startPersistence(done) // clean up
    clientSession = new ClientSession('joe', Math.random(), 'test', 1, transport)
    subscriptions = {}
    presences = {}
  })

  describe('message api', function () {
    describe('incoming', function () {
      it('emits transport message events', function (done) {
        var originalMessage = {message: 'foo'}
        clientSession.on('message', function (message) {
          assert.equal(message, originalMessage)
          done()
        })

        transport.emit('message', originalMessage)
      })
    })
    describe('outgoing - .send', function () {
      it('calls transport.send', function () {
        var originalMessage = {message: 'bar'}

        clientSession.send(originalMessage)

        assert.ok(transport.send.calledWith(originalMessage))
      })
    })
  })

  describe('.storeData and .loadData', function () {
    describe('subscriptions', function () {
      it('should store subscribe operations', function (done) {
        var to = 'presence:/test/account/ticket/1'
        var message = { to: to, op: 'subscribe' }

        subscriptions[to] = message

        clientSession.storeData(message)

        clientSession.readData(function (state) {
          assert.deepEqual(state, {
            subscriptions: subscriptions,
            presences: {}
          })
          done()
        })
      })

      it('should store sync as subscribes', function (done) {
        var to = 'presence:/test/account/ticket/1'
        var message = { to: to, op: 'sync' }

        subscriptions[to] = message

        clientSession.storeData(message)

        clientSession.readData(function (state) {
          assert.deepEqual(state, {
            subscriptions: subscriptions,
            presences: {}
          })
          done()
        })
      })

      it('should remove subscriptions on unsubscribe', function (done) {
        var to = 'presence:/test/account/ticket/1'
        var subscribe = { to: to, op: 'subscribe' }
        var unsubscribe = { to: to, op: 'unsubscribe' }

        clientSession.storeData(subscribe)
        clientSession.storeData(unsubscribe)

        clientSession.readData(function (state) {
          assert.deepEqual(state, {
            subscriptions: {},
            presences: {}
          })
          done()
        })
      })

      it('sync after subscribe, keeps the sync', function (done) {
        var to = 'presence:/test/account/ticket/1'
        var subscribe = { to: to, op: 'subscribe' }
        var sync = { to: to, op: 'sync' }

        clientSession.storeData(subscribe)
        clientSession.storeData(sync)

        subscriptions[to] = sync

        clientSession.readData(function (state) {
          assert.deepEqual(state, {
            subscriptions: subscriptions,
            presences: {}
          })
          done()
        })
      })

      it('subscribe after sync, keeps the sync', function (done) {
        var to = 'presence:/test/account/ticket/1'
        var subscribe = { to: to, op: 'subscribe' }
        var sync = { to: to, op: 'sync' }

        clientSession.storeData(sync)
        clientSession.storeData(subscribe)

        subscriptions[to] = sync

        clientSession.readData(function (state) {
          assert.deepEqual(state, {
            subscriptions: subscriptions,
            presences: {}
          })
          done()
        })
      })
    })

    describe('presences', function () {
      it('should store set online operations', function (done) {
        var to = 'presence:/test/account/ticket/1'
        var message = { to: to, op: 'set', value: 'online' }

        clientSession.storeData(message)

        delete message.value
        presences[to] = message

        clientSession.readData(function (state) {
          assert.deepEqual(state, {
            subscriptions: {},
            presences: presences
          })
          done()
        })
      })

      it('should remove presence when set offline', function (done) {
        var to = 'presence:/test/account/ticket/1'
        var online = { to: to, op: 'set', value: 'online' }
        var offline = { to: to, op: 'set', value: 'offline' }

        clientSession.storeData(online)
        clientSession.storeData(offline)

        clientSession.readData(function (state) {
          assert.deepEqual(state, {
            subscriptions: {},
            presences: {}
          })
          done()
        })
      })
    })
  })
})
