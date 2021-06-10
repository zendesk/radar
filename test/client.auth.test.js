/* globals describe, it, before, after, afterEach */
const assert = require('assert')
const common = require('./common.js')
const Persistence = require('persistence')

describe('auth test', function () {
  let radar, client
  before(function (done) {
    radar = common.spawnRadar()
    radar.sendCommand('start', common.configuration, function () {
      client = common.getClient('client_auth', 111, 0,
        { name: 'tester0' }, done)
    })
  })

  afterEach(function (done) {
    client.message('test').removeAllListeners()
    client.removeAllListeners('err')
    common.startPersistence(done)
  })

  after(function (done) {
    client.dealloc('test')
    common.stopRadar(radar, done)
  })

  describe('if type is disabled', function () {
    it('subscribe fails and emits err', function (done) {
      client.on('err', function (message) {
        assert.ok(message.origin)
        assert.strictEqual(message.origin.op, 'subscribe')
        assert.strictEqual(message.origin.to, 'message:/client_auth/disabled')
        setTimeout(done, 50)
      })

      // Type client_auth/disabled is disabled in tests/lib/radar.js
      client.message('disabled').subscribe(function () {
        assert.ok(false)
      })
    })

    it('publish fails, emits err and is not persisted', function (done) {
      // Cache policy true for this type
      client.on('err', function (message) {
        assert.ok(message.origin)
        assert.strictEqual(message.origin.op, 'publish')
        assert.strictEqual(message.origin.to, 'message:/client_auth/disabled')
        Persistence.readOrderedWithScores('message:/client_auth/disabled', function (messages) {
          assert.deepStrictEqual([], messages)
          done()
        })
      })

      // Type client_auth/disabled is disabled in tests/lib/radar.js
      client.message('disabled').publish('xyz')
    })
  })

  describe('if type is not disabled', function () {
    it('should work', function (done) {
      const originalMessage = { hello: 'world', timestamp: Date.now() }

      client.message('enabled').on(function (message) {
        assert.deepStrictEqual(message.value, originalMessage)
        assert.strictEqual(message.to, 'message:/client_auth/enabled')
        done()
      })

      client.on('err', function (message) {
        assert.ok(false)
      })

      // Messages of the form 'disabled' are disabled
      client.message('enabled').subscribe().publish(originalMessage)
    })
  })
})
