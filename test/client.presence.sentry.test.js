/* globals describe, it, beforeEach, afterEach, before, after */
const common = require('./common.js')
const assert = require('assert')
const Persistence = require('../src/core').Persistence
const Tracker = require('callback_tracker')
const PresenceManager = require('../src/core/resources/presence/presence_manager.js')
const assertHelper = require('./lib/assert_helper.js')
const PresenceMessage = assertHelper.PresenceMessage
const Sentry = require('../src/core/resources/presence/sentry.js')
let radar
let client

describe('given a client and a server,', function () {
  let p
  const sentry = new Sentry('test-sentry', assertHelper.SentryDefaults)
  const presenceManager = new PresenceManager('presence:/dev/test', {}, sentry)
  const publishClientOnline = function (client) {
    presenceManager.addClient(client.clientId, client.userId, client.userType, client.userData)
  }

  before(function (done) {
    common.startPersistence(function () {
      radar = common.spawnRadar()
      radar.sendCommand('start', common.configuration, done)
    })
  })

  after(function (done) {
    radar.sendCommand('stop', {}, function () {
      radar.kill()
      common.endPersistence(done)
    })
  })

  beforeEach(function (done) {
    p = new PresenceMessage('dev', 'test')
    p.client = { userId: 100, clientId: 'abc', userData: { name: 'tester' }, userType: 2 }

    const track = Tracker.create('beforeEach', done)
    // Set ourselves alive
    sentry.start(assertHelper.SentryDefaults, function () {
      client = common.getClient('dev', 123, 0, { name: 'tester' }, track('client 1 ready'))
    })
  })

  afterEach(function (done) {
    p.teardown()
    client.presence('test').set('offline').removeAllListeners()
    client.dealloc('test')
    Persistence.delWildCard('*', done)
  })

  describe('when listening to a presence,', function () {
    beforeEach(function (done) {
      client.presence('test').on(p.notify).subscribe(function () {
        done()
      })
    })

    describe('for incoming online messages,', function () {
      it('should emit offlines if sentry times out', function (done) {
        this.timeout(18000)

        const validate = function () {
          const ts = p.times
          p.assert_message_sequence([
            'online',
            'client_online',
            'client_implicit_offline',
            'offline'
          ])

          // sentry expiry = 4000
          assert.ok((ts[2] - ts[1]) >= 3000, 'sentry expiry was ' + (ts[2] - ts[1]))
          assert.ok((ts[2] - ts[1]) < 6000, 'sentry expiry was ' + (ts[2] - ts[1]))
          // user expiry = 1000
          assert.ok((ts[3] - ts[2]) >= 900, 'user expiry was ' + (ts[3] - ts[2]))
          assert.ok((ts[3] - ts[2]) < 2000, 'user expiry was ' + (ts[3] - ts[2]))
          done()
        }

        publishClientOnline(p.client)
        setTimeout(function () {
          sentry.stop()
          p.on(4, validate)
        }, 1000)
      })

      it('should still be online if sentry is alive', function (done) {
        this.timeout(6000)
        const validate = function () {
          p.assert_message_sequence(['online', 'client_online'])
          done()
        }

        publishClientOnline(p.client)
        setTimeout(function () {
          // Renew sentry
          sentry._keepAlive()
        }, 2000)

        p.fail_on_more_than(2)
        p.once(2, function () {
          setTimeout(validate, 5000)
        })
      })
    })
  })
})
