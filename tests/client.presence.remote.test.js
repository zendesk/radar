var common = require('./common.js'),
    assert = require('assert'),
    logging = require('minilog')('test'),
    Persistence = require('../core').Persistence,
    Tracker = require('callback_tracker'),
    PresenceManager = require('../core/lib/resources/presence/presence_manager.js'),
    Client = require('radar_client').constructor,
    EE = require('events').EventEmitter,
    Sentry = require('../core/lib/resources/presence/sentry.js'),
    radar, client, client2;

describe('given a client and a server,', function() {
  var sentry = new Sentry('test-sentry');
  var presenceManager = new PresenceManager('presence:/dev/test',{}, sentry);
  var stampExpiration = presenceManager.stampExpiration;
  var notifications, notifier = new EE();
  notifier.when = notifier.once;
  var notify = function(message) {
    notifications.push(message);
    notifier.emit(notifications.length);
  };
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
    var track = Tracker.create('beforeEach', done);
    sentry.name = 'test-sentry';
    sentry.publishKeepAlive(); //set ourselves alive
    client = common.getClient('dev', 123, 0, { name: 'tester' }, track('client 1 ready'));
    notifications = [];
    notifier.removeAllListeners();
  });

  afterEach(function(done) {
    client.presence('test').set('offline').removeAllListeners();
    client.dealloc('test');
    presenceManager.stampExpiration = stampExpiration;
    Persistence.delWildCard('*',done);
  });

  describe('without listening to a presence, ', function(done) {
    it('should be able to set offline', function(done) {
      notifier.on(1, function() {
        assert.ok(false);
      });
      client.presence('test').on(notify).set('offline', function() {
        setTimeout(done,1000);
      });
    });

    it('should be able to unsubscribe', function(done) {
      notifier.on(1, function() {
        assert.ok(false);
      });
      client.presence('test').on(notify).unsubscribe(function() {
        setTimeout(done,1000);
      });
    });
  });

  describe('when listening to a presence,', function() {
    beforeEach(function(done) {
      client.presence('test').on(notify).subscribe(function() { done(); });
    });

    describe('for incoming online messages,', function() {
      it('should emit user/client onlines', function(done) {
        var validate = function() {
          assert.equal(notifications.length, 2);
          assert.deepEqual(notifications[0], { to: 'presence:/dev/test', op: 'online', value: { '100': 2 }, userData: { name: 'tester' } });
          assert.deepEqual(notifications[1], { to: 'presence:/dev/test',
            op: 'client_online',
            value: { userId: 100, clientId: 'abc', userData: { name: 'tester' } }
          });
          done();
        };
        presenceManager.addClient('abc', 100, 2, { name: 'tester' });
        notifier.when(2, function() {
          setTimeout(validate, 10);
        });
      });

      it('should ignore duplicate messages', function(done) {
        var validate = function() {
          assert.equal(notifications.length, 2);
          assert.deepEqual(notifications[0], { to: 'presence:/dev/test', op: 'online', value: { '100': 2 }, userData: { name: 'tester' } });
          assert.deepEqual(notifications[1], { to: 'presence:/dev/test',
            op: 'client_online',
            value: { userId: 100, clientId: 'abc', userData: { name: 'tester' } }
          });
          done();
        };
        presenceManager.addClient('abc', 100, 2, { name: 'tester' });
        presenceManager.addClient('abc', 100, 2, { name: 'tester' });
        notifier.when(2, function() {
          setTimeout(validate, 20);
        });
      });

      it('should ignore messages from dead servers (sentry expired and gone)', function(done) {
        sentry.name = 'dead';
        presenceManager.addClient('abc', 100, 2, { name: 'tester' });
        notifier.when(1, function() {
          assert.ok(false);
        });
        setTimeout(done, 10);
      });

      it('should ignore messages from dead servers (sentry expired but not gone)', function(done) {
        sentry.name = 'expired';
        sentry.publishKeepAlive({ expiration: Date.now() - 10});
        presenceManager.addClient('abc', 100, 2, { name: 'tester' });
        notifier.when(1, function() {
          assert.ok(false);
        });
        setTimeout(done, 10);
      });

      describe('from legacy servers, ', function() {
        it('should emit online if message is not expired', function(done) {
          delete sentry.name; //remove sentry and add autopub level expiry
          presenceManager.stampExpiration = function(message) {
            message.at = Date.now();
          };
          var validate = function() {
            assert.equal(notifications.length, 2);
            assert.deepEqual(notifications[0], { to: 'presence:/dev/test', op: 'online', value: { '100': 2 }, userData: { name: 'tester' } });
            assert.deepEqual(notifications[1], { to: 'presence:/dev/test',
              op: 'client_online',
              value: { userId: 100, clientId: 'abc', userData: { name: 'tester' } }
            });
            done();
          };
          presenceManager.addClient('abc', 100, 2, { name: 'tester' });
          notifier.when(2, function() {
            setTimeout(validate, 10);
          });
        });
        it('should ignore expired messages', function(done) {
          delete sentry.name; //remove sentry and add autopub level expiry
          presenceManager.stampExpiration = function(message) {
            message.at = Date.now() - 5000;
          };
          presenceManager.addClient('abc', 100, 2, { name: 'tester' });
          notifier.when(1, function() {
            assert.ok(false);
          });
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
          assert.equal(notifications.length, 4);
          assert.deepEqual(notifications[0], { to: 'presence:/dev/test', op: 'online', value: { '100': 2 }, userData: { name: 'tester' } });
          assert.deepEqual(notifications[1], { to: 'presence:/dev/test',
            op: 'client_online',
            value: { userId: 100, clientId: 'abc', userData: { name: 'tester' } }
          });
          assert.deepEqual(notifications[2], { to: 'presence:/dev/test',
            op: 'client_offline',
            value: { userId: 100, clientId: 'abc' },
            explicit: true
          });
          assert.deepEqual(notifications[3], { to: 'presence:/dev/test', op: 'offline', value: { '100': 2 } });
          done();
        };
        presenceManager.removeClient('abc', 100, 2);
        notifier.when(4, function() {
          setTimeout(validate,10);
        });
      });

      it('should handle multiple explicit disconnects', function(done) {
        var validate = function() {
          assert.equal(notifications.length, 4);
          assert.deepEqual(notifications[0], { to: 'presence:/dev/test', op: 'online', value: { '100': 2 }, userData: { name: 'tester' } });
          assert.deepEqual(notifications[1], { to: 'presence:/dev/test',
            op: 'client_online',
            value: { userId: 100, clientId: 'abc', userData: { name: 'tester' } }
          });
          assert.deepEqual(notifications[2], { to: 'presence:/dev/test',
            op: 'client_offline',
            value: { userId: 100, clientId: 'abc' },
            explicit: true
          });
          assert.deepEqual(notifications[3], { to: 'presence:/dev/test', op: 'offline', value: { '100': 2 } });
          done();
        };
        presenceManager.removeClient('abc', 100, 2);
        presenceManager.removeClient('abc', 100, 2);
        notifier.when(4, function() {
          setTimeout(validate, 10);
        });
      });

      it('should not emit user_offline during user expiry for implicit disconnect', function(done) {
        var validate = function() {
          assert.equal(notifications.length, 3);
          assert.deepEqual(notifications[0], { to: 'presence:/dev/test', op: 'online', value: { '100': 2 }, userData: { name: 'tester' } });
          assert.deepEqual(notifications[1], { to: 'presence:/dev/test',
            op: 'client_online',
            value: { userId: 100, clientId: 'abc', userData: { name: 'tester' } }
          });
          assert.deepEqual(notifications[2], { to: 'presence:/dev/test',
            op: 'client_offline',
            value: { userId: 100, clientId: 'abc' },
            explicit: false
          });
          done();
        };
        presenceManager._implicitDisconnect('abc', 100, 2);
        notifier.when(3, function() {
          setTimeout(validate, 900);
        });
      });

      it('should not emit user_offline during user expiry for multiple implicit disconnects', function(done) {
        var validate = function() {
          assert.equal(notifications.length, 3);
          assert.deepEqual(notifications[0], { to: 'presence:/dev/test', op: 'online', value: { '100': 2 }, userData: { name: 'tester' } });
          assert.deepEqual(notifications[1], { to: 'presence:/dev/test',
            op: 'client_online',
            value: { userId: 100, clientId: 'abc', userData: { name: 'tester' } }
          });
          assert.deepEqual(notifications[2], { to: 'presence:/dev/test',
            op: 'client_offline',
            value: { userId: 100, clientId: 'abc' },
            explicit: false
          });
          done();
        };
        presenceManager._implicitDisconnect('abc', 100, 2);
        presenceManager._implicitDisconnect('abc', 100, 2);
        notifier.when(3, function() {
          setTimeout(validate, 900);
        });
      });

      it('should emit user_offline eventually for implicit disconnect', function(done) {
        var validate = function() {
          assert.equal(notifications.length, 4);
          assert.deepEqual(notifications[0], { to: 'presence:/dev/test', op: 'online', value: { '100': 2 }, userData: { name: 'tester' } });
          assert.deepEqual(notifications[1], { to: 'presence:/dev/test',
            op: 'client_online',
            value: { userId: 100, clientId: 'abc', userData: { name: 'tester' } }
          });
          assert.deepEqual(notifications[2], { to: 'presence:/dev/test',
            op: 'client_offline',
            value: { userId: 100, clientId: 'abc' },
            explicit: false
          });
          assert.deepEqual(notifications[3], { to: 'presence:/dev/test', op: 'offline', value: { '100': 2 } });
          done();
        };
        presenceManager._implicitDisconnect('abc', 100, 2);
        notifier.when(3, function() {
          setTimeout(validate, 1100);
        });
      });
    });
  });


  describe('with existing persistence entries, ', function() {
    beforeEach(function(done) {
      sentry.name = 'server1';
      sentry.publishKeepAlive();
      presenceManager.addClient('abc', 100, 2, { name: 'tester1' });
      sentry.name = 'server2';
      sentry.publishKeepAlive();
      presenceManager.addClient('def', 200, 0, { name: 'tester2' }, done);
    });

    var should_be_online = function(uid, cid, type, name) {
      var online_idx = -1, client_online_idx = -1;

      var i;
      for(i = 0; i < notifications.length; i++) {
        var value = notifications[i].value;
        if(typeof value[uid] !== undefined && value[uid] === type) {
          assert.equal(online_idx, -1);
          online_idx = i;
          assert.equal(value[uid], type);
          assert.deepEqual(notifications[i], { to: 'presence:/dev/test', op: 'online', value: value, userData: { name: name } });
        }
        if(value.userId == uid && value.clientId == cid) {
          assert.equal(client_online_idx, -1);
          client_online_idx = i;
          assert.deepEqual(notifications[i], { to: 'presence:/dev/test', op: 'client_online', value: { userId: uid, clientId: cid, userData: { name: name }}});
        }
      }
      assert.ok(online_idx != -1);
      assert.ok(client_online_idx != -1);
      assert.ok(client_online_idx > online_idx);
      return [ online_idx, client_online_idx ];
    };

    describe('when syncing (v2), ', function() {
      it('should send new notifications and callback correctly', function(done) {
        var callback = false;
        var validate = function() {
          assert.equal(notifications.length, 4);

          should_be_online(100, 'abc', 2, 'tester1');
          should_be_online(200, 'def', 0, 'tester2');
          assert.ok(callback);
          done();
        };
        client.presence('test').on(notify).sync({ version: 2 }, function(message) {
          assert.deepEqual(message, { op: 'get', to: 'presence:/dev/test',
            value: {
              100: { clients: { abc: { name: 'tester1' } }, userType: 2 },
              200: { clients: { def: { name: 'tester2' } }, userType: 0 }
            }
          });
          callback = true;
        });
        notifier.when(4, function() {
          setTimeout(validate, 10);
        });
      });

      it('should send new notifications and callback correctly for different clients with same user', function(done) {
        var callback = false;
        var validate = function() {
          assert.equal(notifications.length, 5);

          should_be_online(100, 'abc', 2, 'tester1');
          should_be_online(100, 'pqr', 2, 'tester1');
          should_be_online(200, 'def', 0, 'tester2');
          assert.ok(callback);
          done();
        };
        presenceManager.addClient('pqr', 100, 2, { name: 'tester1' }, function() {
          client.presence('test').on(notify).sync({ version: 2 }, function(message) {
            assert.deepEqual(message, { op: 'get', to: 'presence:/dev/test',
              value: {
                100: { clients: { abc: { name: 'tester1' }, pqr: { name: 'tester1' } }, userType: 2 },
                200: { clients: { def: { name: 'tester2' } }, userType: 0 }
              }
            });
            callback = true;
          });
        });

        notifier.when(5, function() {
          setTimeout(validate, 10);
        });
      });

      it('subsequent new online notifications should work fine', function(done) {
        var callback = false;
        var validate = function() {
          assert.equal(notifications.length, 6);
          // these should be last two
          assert.deepEqual(notifications[4], { to: 'presence:/dev/test', op: 'online', value: { '300': 2 }, userData: { name: 'tester3' } });
          assert.deepEqual(notifications[5], { to: 'presence:/dev/test', op: 'client_online', value: { userId: 300, clientId: 'hij', userData: { name: 'tester3' }}});

          should_be_online(100, 'abc', 2, 'tester1');
          should_be_online(200, 'def', 0, 'tester2');
          assert.ok(callback);
          done();
        };
        client.presence('test').on(notify).sync({ version: 2 }, function(message) {
          assert.deepEqual(message, { op: 'get', to: 'presence:/dev/test',
            value: {
              100: { clients: { abc: { name: 'tester1' } }, userType: 2 },
              200: { clients: { def: { name: 'tester2' } }, userType: 0 }
            }
          });
          callback = true;
        });

        // After sync's online has come, add another client
        notifier.when(4, function() {
          sentry.name = 'server1';
          sentry.publishKeepAlive();
          presenceManager.addClient('hij', 300, 2, { name: 'tester3' });
        });

        notifier.when(6, function() {
          setTimeout(validate, 10);
        });
      });

      it('should ignore dead server clients (sentry expired and gone)', function(done) {
        var callback = false;
        var validate = function() {
          assert.equal(notifications.length, 4);
          should_be_online(100, 'abc', 2, 'tester1');
          should_be_online(200, 'def', 0, 'tester2');
          assert.ok(callback);
          done();
        };

        sentry.name = 'unknown';
        presenceManager.addClient('klm', 400, 2, { name: 'tester4' }, function() {
          client.presence('test').on(notify).sync({ version: 2 }, function(message) {
            assert.deepEqual(message, { op: 'get', to: 'presence:/dev/test',
              value: {
                100: { clients: { abc: { name: 'tester1' } }, userType: 2 },
                200: { clients: { def: { name: 'tester2' } }, userType: 0 }
              }
            });
            callback = true;
          });
          notifier.when(4, function() {
            setTimeout(validate, 10);
          });
        });
      });

      it('should ignore dead server clients (sentry expired but present)', function(done) {
        var callback = false;
        var validate = function() {
          assert.equal(notifications.length, 4);
          should_be_online(100, 'abc', 2, 'tester1');
          should_be_online(200, 'def', 0, 'tester2');
          assert.ok(callback);
          done();
        };

        sentry.name = 'expired';
        sentry.publishKeepAlive({ expiration: Date.now() - 10});
        presenceManager.addClient('klm', 400, 2, { name: 'tester4' }, function() {
          client.presence('test').on(notify).sync({ version: 2 }, function(message) {
            assert.deepEqual(message, { op: 'get', to: 'presence:/dev/test',
              value: {
                100: { clients: { abc: { name: 'tester1' } }, userType: 2 },
                200: { clients: { def: { name: 'tester2' } }, userType: 0 }
              }
            });
            callback = true;
          });
          notifier.when(4, function() {
            setTimeout(validate, 10);
          });
        });
      });
      describe('with legacy messages, ', function() {
        it('should include clients with unexpired entries', function(done) {
          var callback = false;
          var validate = function() {
            var i;
            assert.equal(notifications.length, 6);
            should_be_online(100, 'abc', 2, 'tester1');
            should_be_online(200, 'def', 0, 'tester2');
            should_be_online(400, 'klm', 0, 'tester4');
            assert.ok(callback);
            done();
          };

          delete sentry.name;
          presenceManager.stampExpiration = function(message) {
            message.at = Date.now();
          };

          presenceManager.addClient('klm', 400, 0, { name: 'tester4' }, function() {
            client.presence('test').on(notify).sync({ version: 2 }, function(message) {
              assert.deepEqual(message, { op: 'get', to: 'presence:/dev/test',
                value: {
                  100: { clients: { abc: { name: 'tester1' } }, userType: 2 },
                  200: { clients: { def: { name: 'tester2' } }, userType: 0 },
                  400: { clients: { klm: { name: 'tester4' } }, userType: 0 }
                }
              });
              callback = true;
            });
            notifier.when(6, function() {
              setTimeout(validate, 10);
            });
          });
        });

        it('should ignore clients with expired entries', function(done) {
          var callback = false;
          var validate = function() {
            assert.equal(notifications.length, 4);
            should_be_online(100, 'abc', 2, 'tester1');
            should_be_online(200, 'def', 0, 'tester2');
            assert.ok(callback);
            done();
          };

          delete sentry.name;
          presenceManager.stampExpiration = function(message) {
            message.at = Date.now() - 30000;
          };

          presenceManager.addClient('klm', 400, 2, { name: 'tester4' }, function() {
            client.presence('test').on(notify).sync({ version: 2 }, function(message) {
              assert.deepEqual(message, { op: 'get', to: 'presence:/dev/test',
                value: {
                  100: { clients: { abc: { name: 'tester1' } }, userType: 2 },
                  200: { clients: { def: { name: 'tester2' } }, userType: 0 }
                }
              });
              callback = true;
            });
            notifier.when(4, function() {
              setTimeout(validate, 10);
            });
          });
        });
      });
    });

    describe('when syncing (v1), (deprecated since callbacks are broken)', function() {
      it('should send all notifications (one extra for sync)', function(done) {
        var validate = function() {
          assert.equal(notifications.length, 4);
          should_be_online(100, 'abc', 2, 'tester1');
          should_be_online(200, 'def', 0, 'tester2');
          done();
        };
        client.presence('test').on(notify).sync(function(message) {
          assert.equal(message.op, 'online');
          assert.equal(message.to, 'presence:/dev/test');
          assert.ok(message.value);
          setTimeout(validate, 10);
        });
      });


      it('subsequent new online notifications should work fine', function(done) {
        var callback = false;
        var validate = function() {
          assert.equal(notifications.length, 6, JSON.stringify(notifications));
          // new
          assert.deepEqual(notifications[4], { to: 'presence:/dev/test', op: 'online', value: { '300': 2 }, userData: { name: 'tester3' } });
          assert.deepEqual(notifications[5], { to: 'presence:/dev/test', op: 'client_online', value: { userId: 300, clientId: 'hij', userData: { name: 'tester3' }}});

          should_be_online(100, 'abc', 2, 'tester1');
          should_be_online(200, 'def', 0, 'tester2');
          assert.ok(callback);
          done();
        };
        client.presence('test').on(notify).sync(function(message) {
          assert.equal(message.op, 'online');
          assert.equal(message.to, 'presence:/dev/test');
          assert.ok(message.value);
          callback = true;
        });

        notifier.when(4, function() {
          // After sync's online has come, add another client
          sentry.name = 'server1';
          sentry.publishKeepAlive();
          presenceManager.addClient('hij', 300, 2, { name: 'tester3' });
        });

        notifier.when(6, function() {
          setTimeout(validate, 10);
        });
      });
    });

    describe('when getting, ', function() {
      it('should send correct callback and no notifications', function(done) {
        var validate = function() {
          assert.equal(notifications.length, 0);
          done();
        };
        client.presence('test').on(notify).get(function(message) {
          assert.deepEqual(message, { to: 'presence:/dev/test', op: 'get', value: { '200': 0, '100': 2 } });
          setTimeout(validate, 10);
        });
      });


      it('should ignore dead server clients (sentry expired and gone)', function(done) {
        var validate = function() {
          assert.equal(notifications.length, 0);
          done();
        };

        sentry.name = 'unknown';
        presenceManager.addClient('klm', 400, 2, { name: 'tester4' }, function() {
          client.presence('test').on(notify).get(function(message) {
            assert.deepEqual(message, { to: 'presence:/dev/test', op: 'get', value: { '200': 0, '100': 2 } });
            setTimeout(validate, 10);
          });
        });
      });

      it('should ignore dead server clients (sentry expired but not gone)', function(done) {
        var validate = function() {
          assert.equal(notifications.length, 0);
          done();
        };

        sentry.name = 'expired';
        sentry.publishKeepAlive({ expiration: Date.now() - 10});
        presenceManager.addClient('klm', 400, 2, { name: 'tester4' }, function() {
          client.presence('test').on(notify).get(function(message) {
            assert.deepEqual(message, { to: 'presence:/dev/test', op: 'get', value: { '200': 0, '100': 2 } });
            setTimeout(validate, 10);
          });
        });
      });

      describe('with legacy messages, ', function() {
        it('should include clients with unexpired entries', function(done) {
          var validate = function() {
            assert.equal(notifications.length, 0);
            done();
          };

          delete sentry.name;
          presenceManager.stampExpiration = function(message) {
            message.at = Date.now();
          };

          presenceManager.addClient('klm', 400, 2, { name: 'tester4' }, function() {
            client.presence('test').on(notify).get(function(message) {
              assert.deepEqual(message, { to: 'presence:/dev/test', op: 'get', value: { '200': 0, '100': 2, '400': 2 } });
              setTimeout(validate, 10);
            });
          });
        });

        it('should ignore clients with expired entries', function(done) {
          var validate = function() {
            assert.equal(notifications.length, 0);
            done();
          };

          delete sentry.name;
          presenceManager.stampExpiration = function(message) {
            message.at = Date.now() - 5000;
          };

          presenceManager.addClient('klm', 400, 2, { name: 'tester4' }, function() {
            client.presence('test').on(notify).get(function(message) {
              assert.deepEqual(message, { to: 'presence:/dev/test', op: 'get', value: { '200': 0, '100': 2 } });
              setTimeout(validate, 10);
            });
          });
        });
      });
    });
  });
});
