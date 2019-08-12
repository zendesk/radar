/* globals describe, it, beforeEach, afterEach, before, after */
var common = require('./common.js')
var assert = require('assert')
var Persistence = require('../src/core').Persistence
var Tracker = require('callback_tracker')
var PresenceManager = require('../src/core/resources/presence/presence_manager.js')
var AssertHelper = require('./lib/assert_helper.js')
var PresenceMessage = AssertHelper.PresenceMessage
var presenceManagerForSentry = AssertHelper.presenceManagerForSentry

describe('given a client and a server', function () {
  var client
  var p
  var presenceManager
  var radar
  var testSentry
  var track

  before(function (done) {
    common.startPersistence(function () {
      radar = common.spawnRadar()
      radar.sendCommand('start', common.configuration, done)
    })
  })

  after(function (done) {
    radar.sendCommand('stop', {}, function () {
      radar.kill()
      common.endPersistence()
      setTimeout(done, 1000)
    })
  })

  beforeEach(function (done) {
    testSentry = AssertHelper.newTestSentry('test-sentry')
    presenceManager = new PresenceManager('presence:/dev/test', {}, testSentry)
    p = new PresenceMessage('dev', 'test')
    p.client = { clientId: 'abc', userId: 100, userType: 2, userData: { name: 'tester' } }
    track = Tracker.create('beforeEach', done)
    testSentry.start(function () {
      client = common.getClient('dev', 122, 0, { name: 'tester' }, track('client 1 ready'))
    })
  })

  afterEach(function (done) {
    client.presence('test').set('offline').removeAllListeners()
    client.dealloc('test')
    testSentry.stop(function () {
      Persistence.delWildCard('*', function () {
        setTimeout(done, 1000)
      })
    })
  })

  describe('without listening to a presence, ', function (done) {
    it('should be able to set offline', function (done) {
      p.fail_on_any_message()
      client.presence('test').on(p.notify).set('offline', function () {
        setTimeout(done, 1000)
      })
    })

    it('should be able to unsubscribe', function (done) {
      p.fail_on_any_message()
      client.presence('test').on(p.notify).unsubscribe(function () {
        setTimeout(done, 1000)
      })
    })
  })

  describe('when listening to a presence,', function () {
    beforeEach(function (done) {
      client.presence('test').on(p.notify).subscribe(function () { done() })
    })

    describe('for incoming online messages,', function () {
      it('should emit user/client onlines', function (done) {
        var validate = function () {
          p.assert_message_sequence(['online', 'client_online'])
          done()
        }
        presenceManager.addClient('abc', 100, 2, { name: 'tester' })

        p.fail_on_more_than(2)
        p.on(2, function () {
          setTimeout(validate, 10)
        })
      })

      it('should ignore duplicate messages', function (done) {
        var validate = function () {
          p.assert_message_sequence(['online', 'client_online'])
          done()
        }
        presenceManager.addClient('abc', 100, 2, { name: 'tester' })
        presenceManager.addClient('abc', 100, 2, { name: 'tester' })
        p.on(2, function () {
          setTimeout(validate, 20)
        })
      })

      it('should ignore messages from dead servers (sentry expired and gone)', function (done) {
        presenceManagerForSentry('dead', { dead: true }, function (pm) {
          pm.addClient('abc', 100, 2, { name: 'tester' })
        })

        p.fail_on_any_message()
        setTimeout(done, 10)
      })

      it('should ignore messages from dead servers (sentry expired but not gone)', function (done) {
        presenceManagerForSentry('expired', { expiration: Date.now() - 10 }, function (pm) {
          pm.addClient('abc', 100, 2, { name: 'tester' })
        })

        p.fail_on_any_message()
        setTimeout(done, 10)
      })
    })

    describe('for incoming offline messages,', function () {
      beforeEach(function (done) {
        presenceManager.addClient('abc', 100, 2, { name: 'tester' }, done)
      })

      it('should emit user/client offline for explicit disconnect', function (done) {
        var validate = function () {
          p.assert_message_sequence(['online', 'client_online', 'client_explicit_offline', 'offline'])
          done()
        }
        presenceManager.removeClient('abc', 100, 2)
        p.on(4, function () {
          setTimeout(validate, 10)
        })
      })

      it('should handle multiple explicit disconnects', function (done) {
        var validate = function () {
          p.assert_message_sequence(['online', 'client_online', 'client_explicit_offline', 'offline'])
          done()
        }
        presenceManager.removeClient('abc', 100, 2)
        presenceManager.removeClient('abc', 100, 2)
        p.on(4, function () {
          setTimeout(validate, 10)
        })
      })

      it('should not emit user_offline during user expiry for implicit disconnect', function (done) {
        this.timeout(4000)

        var validate = function () {
          p.assert_message_sequence(['online', 'client_online', 'client_implicit_offline'])
          done()
        }
        presenceManager._implicitDisconnect('abc', 100, 2)
        p.on(3, function () {
          setTimeout(validate, 800)
        })
      })

      it('should not emit user_offline during user expiry for multiple implicit disconnects', function (done) {
        this.timeout(4000)

        var validate = function () {
          p.assert_message_sequence(['online', 'client_online', 'client_implicit_offline'])
          done()
        }
        presenceManager._implicitDisconnect('abc', 100, 2)
        presenceManager._implicitDisconnect('abc', 100, 2)
        p.on(3, function () {
          setTimeout(validate, 800)
        })
      })

      it('should emit user_offline eventually for implicit disconnect', function (done) {
        this.timeout(5000)

        var validate = function () {
          p.assert_message_sequence(['online', 'client_online', 'client_implicit_offline', 'offline'])
          done()
        }
        presenceManager._implicitDisconnect('abc', 100, 2)
        p.on(4, function () {
          setTimeout(validate, 800)
        })
      })
    })
  })

  describe('with existing persistence entries, ', function () {
    var clients = {}
    beforeEach(function (done) {
      presenceManagerForSentry('server1', function (pm) {
        pm.addClient('abc', 100, 2, { name: 'tester1' }, function () {
          presenceManagerForSentry('server2', function (pm2) {
            pm2.addClient('def', 200, 0, { name: 'tester2' }, done)
          })
        })
      })

      clients = {
        abc: { clientId: 'abc', userId: 100, userType: 2, userData: { name: 'tester1' } },
        def: { clientId: 'def', userId: 200, userType: 0, userData: { name: 'tester2' } },
        hij: { clientId: 'hij', userId: 300, userType: 2, userData: { name: 'tester3' } },
        pqr: { clientId: 'pqr', userId: 100, userType: 2, userData: { name: 'tester1' } },
        klm: { clientId: 'klm', userId: 400, userType: 2, userData: { name: 'tester4' } }
      }
    })

    describe('when syncing (v2), ', function () {
      it('should send new notifications and callbackFn correctly', function (done) {
        this.timeout(5000)
        var callbackFn = false
        var validate = function () {
          p.for_online_clients(clients.abc, clients.def)
            .assert_onlines_received()

          assert.ok(callbackFn)
          done()
        }

        client.presence('test').on(p.notify).sync({ version: 2 }, function (message) {
          p.for_online_clients(clients.abc, clients.def)
            .assert_sync_v2_response(message)

          callbackFn = true
        })

        p.on(4, function () {
          setTimeout(validate, 100)
        })
        p.fail_on_more_than(4)
      })

      it('should send new notifications and callbackFn correctly for different clients with same user', function (done) {
        var callbackFn = false
        var validate = function () {
          p.for_online_clients(clients.abc, clients.def, clients.pqr)
            .assert_onlines_received()
          assert.ok(callbackFn)
          done()
        }
        presenceManager.addClient('pqr', 100, 2, { name: 'tester1' }, function () {
          client.presence('test').on(p.notify).sync({ version: 2 }, function (message) {
            p.for_online_clients(clients.abc, clients.def, clients.pqr)
              .assert_sync_v2_response(message)
            callbackFn = true
          })
        })

        p.on(5, function () {
          setTimeout(validate, 10)
        })
        p.fail_on_more_than(5)
      })

      it('subsequent new online notifications should work fine', function (done) {
        var callbackFn = false
        var validate = function () {
          // these should be last two, so from=4
          p.for_client(clients.hij)
            .assert_message_sequence(['online', 'client_online'], 4)

          p.for_online_clients(clients.abc, clients.def).assert_onlines_received()
          assert.ok(callbackFn)
          done()
        }
        client.presence('test').on(p.notify).sync({ version: 2 }, function (message) {
          p.for_online_clients(clients.abc, clients.def)
            .assert_sync_v2_response(message)
          callbackFn = true
        })

        // After sync's online has come, add another client
        p.on(4, function () {
          presenceManagerForSentry('server1', function (pm) {
            pm.addClient('hij', 300, 2, { name: 'tester3' })
          })
        })

        p.fail_on_more_than(6)
        p.on(6, function () {
          setTimeout(validate, 10)
        })
      })

      it('should ignore dead server clients (sentry expired and gone)', function (done) {
        var callbackFn = false
        var validate = function () {
          p.for_online_clients(clients.abc, clients.def).assert_onlines_received()
          assert.ok(callbackFn)
          done()
        }

        presenceManagerForSentry('unknown', { dead: true }, function (pm) {
          pm.addClient('klm', 400, 2, { name: 'tester4' }, function () {
            client.presence('test').on(p.notify).sync({ version: 2 }, function (message) {
              p.for_online_clients(clients.abc, clients.def).assert_sync_v2_response(message)
              callbackFn = true
            })

            p.fail_on_more_than(4)
            p.on(4, function () {
              setTimeout(validate, 1000)
            })
          })
        })
      })

      it('should ignore dead server clients (sentry expired but present)', function (done) {
        var callbackFn = false
        var validate = function () {
          p.for_online_clients(clients.abc, clients.def).assert_onlines_received()
          assert.ok(callbackFn)
          done()
        }

        presenceManagerForSentry('expired', { expiration: Date.now() - 10 }, function (pm) {
          pm.addClient('klm', 400, 2, { name: 'tester4' }, function () {
            client.presence('test').on(p.notify).sync({ version: 2 }, function (message) {
              p.for_online_clients(clients.abc, clients.def)
                .assert_sync_v2_response(message)
              callbackFn = true
            })
            p.fail_on_more_than(4)
            p.on(4, function () {
              setTimeout(validate, 10)
            })
          })
        })
      })
    })

    describe('when syncing (v1), (deprecated since callbacks are broken)', function () {
      it('should send all notifications (one extra for sync)', function (done) {
        var validate = function () {
          p.for_online_clients(clients.abc, clients.def).assert_onlines_received()
          done()
        }
        client.presence('test').on(p.notify).sync(function (message) {
          p.for_online_clients(clients.abc, clients.def)
            .assert_sync_response(message)
          setTimeout(validate, 10)
        })

        p.fail_on_more_than(4)
      })

      it('subsequent new online notifications should work fine', function (done) {
        var callbackFn = false
        var validate = function () {
          // after 4 messages,
          p.for_client(clients.hij)
            .assert_message_sequence(['online', 'client_online'], 4)

          p.for_online_clients(clients.abc, clients.def).assert_onlines_received()
          assert.ok(callbackFn)
          done()
        }
        client.presence('test').on(p.notify).sync(function (message) {
          p.for_online_clients(clients.abc, clients.def)
            .assert_sync_response(message)
          callbackFn = true
        })

        p.on(4, function () {
          // After sync's online has come, add another client
          presenceManagerForSentry('server1', function (pm) {
            pm.addClient('hij', 300, 2, { name: 'tester3' })
          })
        })

        p.on(6, function () {
          setTimeout(validate, 10)
        })

        p.fail_on_more_than(6)
      })
    })

    describe('when getting, ', function () {
      it('should send correct callbackFn and no notifications', function (done) {
        client.presence('test').on(p.notify).get(function (message) {
          p.for_online_clients(clients.abc, clients.def)
            .assert_get_response(message)
          setTimeout(done, 10)
        })

        p.fail_on_any_message()
      })

      it('should ignore dead server clients (sentry gone)', function (done) {
        presenceManagerForSentry('unknown', { dead: true }, function (pm) {
          pm.addClient('klm', 400, 2, { name: 'tester4' }, function () {
            client.presence('test').on(p.notify).get(function (message) {
              p.for_online_clients(clients.abc, clients.def).assert_get_response(message)
              setTimeout(done, 10)
            })
          })
        })

        p.fail_on_any_message()
      })

      it('should ignore dead server clients (sentry expired but not gone)', function (done) {
        presenceManagerForSentry('expired', { expiration: Date.now() - 10 }, function (pm) {
          pm.addClient('klm', 400, 2, { name: 'tester4' }, function () {
            client.presence('test').on(p.notify).get(function (message) {
              p.for_online_clients(clients.abc, clients.def)
                .assert_get_response(message)
              setTimeout(done, 100)
            })
          })
        })

        p.fail_on_any_message()
      })
    })
  })
})
