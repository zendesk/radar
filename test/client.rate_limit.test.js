/* globals describe, it, beforeEach, afterEach, before, after */
const common = require('./common.js')
const assert = require('assert')
const Tracker = require('callback_tracker')
const PresenceMessage = require('./lib/assert_helper.js').PresenceMessage
let radar
let client

describe('The Server', function () {
  let p
  before(function (done) {
    radar = common.spawnRadar()
    radar.sendCommand('start', common.configuration, done)
  })

  after(function (done) {
    common.stopRadar(radar, done)
  })

  beforeEach(function (done) {
    p = new PresenceMessage('dev', 'limited1')
    const track = Tracker.create('beforeEach', done)
    client = common.getClient('dev', 123, 0, { name: 'tester' }, track('client 1 ready'))
  })

  afterEach(function () {
    p.teardown()

    client.presence('limited1').set('offline').removeAllListeners()
    client.dealloc('test')
  })

  describe('given a limited presence type', function () {
    it('should not allow subscription after a certain limit', function (done) {
      let success = false

      client.on('err', function (message) {
        assert.strictEqual(message.op, 'err')
        assert.strictEqual(message.value, 'rate limited')
        success = true
      })

      client.presence('limited1').on(p.notify).subscribe(function (message) {
        p.for_client(client).assert_ack_for_subscribe(message)
        client.presence('limited2').subscribe()
      })

      setTimeout(function () {
        assert(success, 'Client did not receive an err message')
        done()
      }, 1000)
    })

    it('should handle decrement on unsubscribe ', function (done) {
      client.presence('limited1').subscribe(function () {
        client.presence('limited2').subscribe()
        // Already received the err

        client.presence('limited1').unsubscribe(function () {
          client.presence('limited1').subscribe(function () { done() })
        })
      })
    })

    it.skip('should reset rate on client disconnect', function (done) {
      client.presence('limited1').subscribe(function () {
        client.presence('limited2').subscribe()
        // Already received the err
        client.dealloc('test')
        // we need to find a way to test client disconnect and reconnect
        done()
      })
    })
  })
})
