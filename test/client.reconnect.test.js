/* globals describe, it, beforeEach, afterEach, before, after */

var common = require('./common.js')
var assert = require('assert')
var Tracker = require('callback_tracker')
var Backoff = require('radar_client').Backoff
var radar

describe('When radar server restarts', function () {
  var client, client2

  before(function (done) {
    Backoff.durations = [ 100, 200, 400 ]
    Backoff.fallback = 200
    Backoff.maxSplay = 100

    radar = common.spawnRadar()
    radar.sendCommand('start', common.configuration, done)
  })

  beforeEach(function (done) {
    var track = Tracker.create('beforeEach reconnect', done)
    client = common.getClient('test', 123, 0, { name: 'tester' }, track('client 1 ready'))
    client2 = common.getClient('test', 246, 0, { name: 'tester2' }, track('client 2 ready'))
  })

  afterEach(function () {
    client.presence('restore').removeAllListeners()
    client.message('restore').removeAllListeners()
    client.status('restore').removeAllListeners()

    client.message('foo').removeAllListeners()

    client.dealloc('test')
    client2.dealloc('test')
  })

  after(function (done) {
    common.stopRadar(radar, done)
  })

  it('reestablishes presence', function (done) {
    this.timeout(4000)
    var verifySubscriptions = function () {
      setTimeout(function () {
        client2.presence('restore').get(function (message) {
          assert.equal('get', message.op)
          assert.equal('presence:/test/restore', message.to)
          assert.deepEqual({ 123: 0 }, message.value)
          done()
        })
      }, 1000) // let's wait a little
    }

    client.presence('restore').set('online', function () {
      common.restartRadar(radar, common.configuration, [client, client2], verifySubscriptions)
    })
  })

  it('reconnects existing clients', function (done) {
    this.timeout(4000)
    var clientEvents = []
    var client2Events = []

    var states = ['connected', 'activated']
    client.once('disconnected', function () {
      states.forEach(function (state) {
        client.once(state, function () { clientEvents.push(state) })
      })
    })
    client2.once('disconnected', function () {
      states.forEach(function (state) {
        client2.once(state, function () { client2Events.push(state) })
      })
    })

    common.restartRadar(radar, common.configuration, [client, client2], function () {
      assert.deepEqual(clientEvents, ['connected', 'activated'])
      assert.deepEqual(client2Events, ['connected', 'activated'])
      assert.equal('activated', client.currentState())
      assert.equal('activated', client2.currentState())
      done()
    })
  })

  it('resubscribes to subscriptions', function (done) {
    this.timeout(4000)
    var verifySubscriptions = function () {
      var tracker = Tracker.create('resources updated', done)

      client.message('restore').on(tracker('message updated', function (message) {
        assert.equal(message.to, 'message:/test/restore')
        assert.equal(message.op, 'publish')
        assert.equal(message.value, 'hello')
      })).publish('hello')

      client.status('restore').on(tracker('status updated', function (message) {
        assert.equal(message.to, 'status:/test/restore')
        assert.equal(message.op, 'set')
        assert.equal(message.value, 'hello')
      })).set('hello')

      var presence_done = tracker('presence updated')
      client.presence('restore').on(function (message) {
        if (message.op === 'online') {
          assert.equal(message.to, 'presence:/test/restore')
          presence_done()
        }
      }).set('online')
    }

    var tracker = Tracker.create('subscriptions done', function () {
      common.restartRadar(radar, common.configuration, [client], verifySubscriptions)
    })
    client.message('restore').subscribe(tracker('message subscribed'))
    client.presence('restore').subscribe(tracker('presence subscribed'))
    client.status('restore').subscribe(tracker('status subscribed'))
  })

  it('must not repeat synced chat (messagelist) messages, with two clients', function (done) {
    this.timeout(4000)
    var messages = []
    var verifySubscriptions = function () {
      assert.equal(messages.length, 2)
      assert.ok(messages.some(function (m) { return m.value === 'a1' }))
      assert.ok(messages.some(function (m) { return m.value === 'a2' }))
      done()
    }

    client.alloc('test', function () {
      client2.alloc('test', function () {
        client.message('foo').on(function (msg) {
          messages.push(msg)
          if (messages.length === 2) {
            // When we have enough, wait a while and check
            setTimeout(verifySubscriptions, 100)
          }
        }).sync()

        client2.message('foo').publish('a1', function () {
          common.restartRadar(radar, common.configuration, [client, client2], function () {
            client.message('foo').publish('a2')
          })
        })
      })
    })
  })
})
