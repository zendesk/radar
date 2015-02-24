var common = require('./common.js'),
    assert = require('assert'),
    logging = require('minilog')('test'),
    Persistence = require('../core').Persistence,
    Tracker = require('callback_tracker'),
    PresenceManager = require('../core/lib/resources/presence/presence_manager.js'),
    Client = require('radar_client').constructor,
    EE = require('events').EventEmitter,
    PresenceAssert = require('./lib/assert_helper.js').PresenceMessage,
    Sentry = require('../core/lib/resources/presence/sentry.js'),
    radar, client, client2;

describe('given a client and a server,', function() {
  var p, sentry = new Sentry('test-sentry');
  var presenceManager = new PresenceManager('presence:/dev/test',{}, sentry);
  var stampExpiration = presenceManager.stampExpiration;
  before(function(done) {
    common.startPersistence(function() {
      radar = common.spawnRadar();
      radar.sendCommand('start', common.configuration, done);
    });
  });

  after(function(done) {
    radar.sendCommand('stop', {}, function() {
      radar.kill();
      common.endPersistence(done);
    });
  });

  beforeEach(function(done) {
    p = new PresenceAssert('dev', 'test');
    p.client = { clientId: 'abc', userId: 100, userType: 2, userData: { name: 'tester' } };
    var track = Tracker.create('beforeEach', done);
    sentry.name = 'test-sentry';

    // Set ourselves alive
    sentry.publishKeepAlive();

    client = common.getClient('dev', 123, 0, { name: 'tester' }, track('client 1 ready'));
    notifications = [];
  });

  afterEach(function(done) {
    client.presence('test').set('offline').removeAllListeners();
    client.dealloc('test');
    presenceManager.stampExpiration = stampExpiration;
    Persistence.delWildCard('*',done);
  });

  describe('without listening to a presence, ', function(done) {
    it('should be able to set offline', function(done) {
      p.fail_on_any_message();
      client.presence('test').on(p.notify).set('offline', function() {
        setTimeout(done,1000);
      });
    });

    it('should be able to unsubscribe', function(done) {
      p.fail_on_any_message();
      client.presence('test').on(p.notify).unsubscribe(function() {
        setTimeout(done,1000);
      });
    });
  });

  describe('when listening to a presence,', function() {
    beforeEach(function(done) {
      client.presence('test').on(p.notify).subscribe(function() { done(); });
    });

    describe('for incoming online messages,', function() {
      it('should emit user/client onlines', function(done) {
        var validate = function() {
          p.assert_message_sequence([ 'online', 'client_online' ]);
          done();
        };
        presenceManager.addClient('abc', 100, 2, { name: 'tester' });

        p.fail_on_more_than(2);
        p.on(2, function() {
          setTimeout(validate, 10);
        });
      });

      it('should ignore duplicate messages', function(done) {
        var validate = function() {
          p.assert_message_sequence([ 'online', 'client_online' ]);
          done();
        };
        presenceManager.addClient('abc', 100, 2, { name: 'tester' });
        presenceManager.addClient('abc', 100, 2, { name: 'tester' });
        p.on(2, function() {
          setTimeout(validate, 20);
        });
      });

      it('should ignore messages from dead servers (sentry expired and gone)', function(done) {
        sentry.name = 'dead';
        presenceManager.addClient('abc', 100, 2, { name: 'tester' });
        p.fail_on_any_message();
        setTimeout(done, 10);
      });

      it('should ignore messages from dead servers (sentry expired but not gone)', function(done) {
        sentry.name = 'expired';
        sentry.publishKeepAlive({ expiration: Date.now() - 10});
        presenceManager.addClient('abc', 100, 2, { name: 'tester' });
        p.fail_on_any_message();
        setTimeout(done, 10);
      });

      describe('from legacy servers, ', function() {
        it('should emit online if message is not expired', function(done) {

          // Remove sentry and add autopub level expiry
          delete sentry.name;

          presenceManager.stampExpiration = function(message) {
            message.at = Date.now();
          };
          var validate = function() {
            p.assert_message_sequence([ 'online', 'client_online' ]);
            done();
          };
          presenceManager.addClient('abc', 100, 2, { name: 'tester' });

          p.fail_on_more_than(2);
          p.on(2, function() {
            setTimeout(validate, 10);
          });
        });
        it('should ignore expired messages', function(done) {

          // Remove sentry and add autopub level expiry
          delete sentry.name;
          presenceManager.stampExpiration = function(message) {
            message.at = Date.now() - 5000;
          };
          presenceManager.addClient('abc', 100, 2, { name: 'tester' });
          p.fail_on_any_message();
          setTimeout(done, 10);
        });
      });
    });
    describe('for incoming offline messages,', function() {
      beforeEach(function(done) {
        presenceManager.addClient('abc', 100, 2, { name: 'tester' }, done);
      });

      it('should emit user/client offline for explicit disconnect', function(done) {
        var validate = function() {
          p.assert_message_sequence([ 'online', 'client_online', 'client_explicit_offline', 'offline' ]);
          done();
        };
        presenceManager.removeClient('abc', 100, 2);
        p.on(4, function() {
          setTimeout(validate,10);
        });
      });

      it('should handle multiple explicit disconnects', function(done) {
        var validate = function() {
          p.assert_message_sequence([ 'online', 'client_online', 'client_explicit_offline', 'offline' ]);
          done();
        };
        presenceManager.removeClient('abc', 100, 2);
        presenceManager.removeClient('abc', 100, 2);
        p.on(4, function() {
          setTimeout(validate, 10);
        });
      });

      it('should not emit user_offline during user expiry for implicit disconnect', function(done) {
        var validate = function() {
          p.assert_message_sequence([ 'online', 'client_online', 'client_implicit_offline' ]);
          done();
        };
        presenceManager._implicitDisconnect('abc', 100, 2);
        p.on(3, function() {
          setTimeout(validate, 900);
        });
      });

      it('should not emit user_offline during user expiry for multiple implicit disconnects', function(done) {
        var validate = function() {
          p.assert_message_sequence([ 'online', 'client_online', 'client_implicit_offline' ]);
          done();
        };
        presenceManager._implicitDisconnect('abc', 100, 2);
        presenceManager._implicitDisconnect('abc', 100, 2);
        p.on(3, function() {
          setTimeout(validate, 900);
        });
      });

      it('should emit user_offline eventually for implicit disconnect', function(done) {
        var validate = function() {
          p.assert_message_sequence([ 'online', 'client_online', 'client_implicit_offline', 'offline' ]);
          done();
        };
        presenceManager._implicitDisconnect('abc', 100, 2);
        p.on(3, function() {
          setTimeout(validate, 1100);
        });
      });
    });
  });


  describe('with existing persistence entries, ', function() {
    var clients = {};
    beforeEach(function(done) {
      sentry.name = 'server1';
      sentry.publishKeepAlive();
      presenceManager.addClient('abc', 100, 2, { name: 'tester1' });
      sentry.name = 'server2';
      sentry.publishKeepAlive();
      presenceManager.addClient('def', 200, 0, { name: 'tester2' }, done);
      clients =  {
        abc: { clientId: 'abc', userId: 100, userType: 2, userData: { name: 'tester1' } },
        def: { clientId: 'def', userId: 200, userType: 0, userData: { name: 'tester2' } },
        hij: { clientId: 'hij', userId: 300, userType: 2, userData: { name: 'tester3' } },
        pqr: { clientId: 'pqr', userId: 100, userType: 2, userData: { name: 'tester1' } },
        klm: { clientId: 'klm', userId: 400, userType: 2, userData: { name: 'tester4' } }
      };
    });

    describe('when syncing (v2), ', function() {
      it('should send new notifications and callback correctly', function(done) {
        var callback = false;
        var validate = function() {
          p.for_online_clients(clients.abc, clients.def).assert_onlines_received();
          assert.ok(callback);
          done();
        };
        client.presence('test').on(p.notify).sync({ version: 2 }, function(message) {
          p.for_online_clients(clients.abc, clients.def)
            .assert_sync_v2_response(message);
          callback = true;
        });

        p.on(4, function() {
          setTimeout(validate, 10);
        });
        p.fail_on_more_than(4);
      });

      it('should send new notifications and callback correctly for different clients with same user', function(done) {
        var callback = false;
        var validate = function() {
          p.for_online_clients(clients.abc, clients.def, clients.pqr)
            .assert_onlines_received();
          assert.ok(callback);
          done();
        };
        presenceManager.addClient('pqr', 100, 2, { name: 'tester1' }, function() {
          client.presence('test').on(p.notify).sync({ version: 2 }, function(message) {
            p.for_online_clients(clients.abc, clients.def, clients.pqr)
              .assert_sync_v2_response(message);
            callback = true;
          });
        });

        p.on(5, function() {
          setTimeout(validate, 10);
        });
        p.fail_on_more_than(5);
      });

      it('subsequent new online notifications should work fine', function(done) {
        var callback = false;
        var validate = function() {
          // these should be last two, so from=4
          p.for_client(clients.hij)
            .assert_message_sequence(['online', 'client_online'], 4);

          p.for_online_clients(clients.abc, clients.def).assert_onlines_received();
          assert.ok(callback);
          done();
        };
        client.presence('test').on(p.notify).sync({ version: 2 }, function(message) {
          p.for_online_clients(clients.abc, clients.def)
            .assert_sync_v2_response(message);
          callback = true;
        });

        // After sync's online has come, add another client
        p.on(4, function() {
          sentry.name = 'server1';
          sentry.publishKeepAlive();
          presenceManager.addClient('hij', 300, 2, { name: 'tester3' });
        });

        p.fail_on_more_than(6);
        p.on(6, function() {
          setTimeout(validate, 10);
        });
      });

      it('should ignore dead server clients (sentry expired and gone)', function(done) {
        var callback = false;
        var validate = function() {
          p.for_online_clients(clients.abc, clients.def).assert_onlines_received();
          assert.ok(callback);
          done();
        };

        sentry.name = 'unknown';
        presenceManager.addClient('klm', 400, 2, { name: 'tester4' }, function() {
          client.presence('test').on(p.notify).sync({ version: 2 }, function(message) {
            p.for_online_clients(clients.abc, clients.def).assert_sync_v2_response(message);
            callback = true;
          });

          p.fail_on_more_than(4);
          p.on(4, function() {
            setTimeout(validate, 10);
          });
        });
      });

      it('should ignore dead server clients (sentry expired but present)', function(done) {
        var callback = false;
        var validate = function() {
          p.for_online_clients(clients.abc, clients.def).assert_onlines_received();
          assert.ok(callback);
          done();
        };

        sentry.name = 'expired';
        sentry.publishKeepAlive({ expiration: Date.now() - 10});
        presenceManager.addClient('klm', 400, 2, { name: 'tester4' }, function() {
          client.presence('test').on(p.notify).sync({ version: 2 }, function(message) {
            p.for_online_clients(clients.abc, clients.def)
              .assert_sync_v2_response(message);
            callback = true;
          });
          p.fail_on_more_than(4);
          p.on(4, function() {
            setTimeout(validate, 10);
          });
        });
      });
      describe('with legacy messages, ', function() {
        it('should include clients with unexpired entries', function(done) {
          var callback = false;
          var validate = function() {
            p.for_online_clients(clients.abc, clients.def, clients.klm)
              .assert_onlines_received();
            assert.ok(callback);
            done();
          };

          delete sentry.name;
          presenceManager.stampExpiration = function(message) {
            message.at = Date.now();
          };

          presenceManager.addClient('klm', 400, 2, { name: 'tester4' }, function() {
            client.presence('test').on(p.notify).sync({ version: 2 }, function(message) {
              p.for_online_clients(clients.abc, clients.def, clients.klm)
                .assert_sync_v2_response(message);
              callback = true;
            });

            p.fail_on_more_than(6);
            p.on(6, function() {
              setTimeout(validate, 10);
            });
          });
        });

        it('should ignore clients with expired entries', function(done) {
          var callback = false;
          var validate = function() {
            p.for_online_clients(clients.abc, clients.def).assert_onlines_received();
            assert.ok(callback);
            done();
          };

          delete sentry.name;
          presenceManager.stampExpiration = function(message) {
            message.at = Date.now() - 30000;
          };

          presenceManager.addClient('klm', 400, 2, { name: 'tester4' }, function() {
            client.presence('test').on(p.notify).sync({ version: 2 }, function(message) {
              p.for_online_clients(clients.abc, clients.def)
                .assert_sync_v2_response(message);
              callback = true;
            });

            p.fail_on_more_than(4);
            p.on(4, function() {
              setTimeout(validate, 10);
            });
          });
        });
      });
    });

    describe('when syncing (v1), (deprecated since callbacks are broken)', function() {
      it('should send all notifications (one extra for sync)', function(done) {
        var validate = function() {
          p.for_online_clients(clients.abc, clients.def).assert_onlines_received();
          done();
        };
        client.presence('test').on(p.notify).sync(function(message) {
          p.for_online_clients(clients.abc, clients.def)
            .assert_sync_response(message);
          setTimeout(validate, 10);
        });

        p.fail_on_more_than(4);
      });


      it('subsequent new online notifications should work fine', function(done) {
        var callback = false;
        var validate = function() {
          // after 4 messages,
          p.for_client(clients.hij)
            .assert_message_sequence(['online', 'client_online'], 4);

          p.for_online_clients(clients.abc, clients.def).assert_onlines_received();
          assert.ok(callback);
          done();
        };
        client.presence('test').on(p.notify).sync(function(message) {
          p.for_online_clients(clients.abc, clients.def)
            .assert_sync_response(message);
          callback = true;
        });

        p.on(4, function() {
          // After sync's online has come, add another client
          sentry.name = 'server1';
          sentry.publishKeepAlive();
          presenceManager.addClient('hij', 300, 2, { name: 'tester3' });
        });

        p.on(6, function() {
          setTimeout(validate, 10);
        });

        p.fail_on_more_than(6);
      });
    });

    describe('when getting, ', function() {
      it('should send correct callback and no notifications', function(done) {
        client.presence('test').on(p.notify).get(function(message) {
          p.for_online_clients(clients.abc, clients.def)
            .assert_get_response(message);
          setTimeout(done, 10);
        });

        p.fail_on_any_message();
      });


      it('should ignore dead server clients (sentry expired and gone)', function(done) {
        sentry.name = 'unknown';
        presenceManager.addClient('klm', 400, 2, { name: 'tester4' }, function() {
          client.presence('test').on(p.notify).get(function(message) {
            p.for_online_clients(clients.abc, clients.def)
              .assert_get_response(message);
            setTimeout(done, 10);
          });
        });

        p.fail_on_any_message();
      });

      it('should ignore dead server clients (sentry expired but not gone)', function(done) {
        sentry.name = 'expired';
        sentry.publishKeepAlive({ expiration: Date.now() - 10});
        presenceManager.addClient('klm', 400, 2, { name: 'tester4' }, function() {
          client.presence('test').on(p.notify).get(function(message) {
            p.for_online_clients(clients.abc, clients.def)
              .assert_get_response(message);
            setTimeout(done, 10);
          });
        });

        p.fail_on_any_message();
      });

      describe('with legacy messages, ', function() {
        it('should include clients with unexpired entries', function(done) {
          p.fail_on_any_message();

          delete sentry.name;
          presenceManager.stampExpiration = function(message) {
            message.at = Date.now();
          };

          presenceManager.addClient('klm', 400, 2, { name: 'tester4' }, function() {
            client.presence('test').on(p.notify).get(function(message) {
              p.for_online_clients(clients.abc, clients.def, clients.klm)
                .assert_get_response(message);
              setTimeout(done, 10);
            });
          });
        });

        it('should ignore clients with expired entries', function(done) {
          p.fail_on_any_message();

          delete sentry.name;
          presenceManager.stampExpiration = function(message) {
            message.at = Date.now() - 5000;
          };

          presenceManager.addClient('klm', 400, 2, { name: 'tester4' }, function() {
            client.presence('test').on(p.notify).get(function(message) {
              p.for_online_clients(clients.abc, clients.def)
                .assert_get_response(message);
              setTimeout(done, 10);
            });
          });
        });
      });
    });
  });
});
