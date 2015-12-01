/* globals describe, it, beforeEach */
var common = require('./common.js')
var assert = require('assert')
var ClientSession = require('../client/client_session.js')

describe('ClientSession', function () {
  var clientSession
  var presences
  var subscriptions

  beforeEach(function (done) {
    common.startPersistence(done) // clean up
    clientSession = new ClientSession('joe', Math.random(), 'test', 1)
    subscriptions = {}
    presences = {}
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
