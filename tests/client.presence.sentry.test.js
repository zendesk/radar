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
  var presenceManager = new PresenceManager('presence:/dev/test', {}, sentry);
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
    delete presenceManager.stampExpiration; //restore to prototype
    sentry.name = 'test-sentry';
    sentry.publishKeepAlive(); //set ourselves alive
    client = common.getClient('dev', 123, 0, { name: 'tester' }, track('client 1 ready'));
  });

  afterEach(function(done) {
    client.presence('test').set('offline').removeAllListeners();
    client.dealloc('test');
    Persistence.delWildCard('*',done);
  });

  describe('when listening to a presence,', function() {
    var notifications, notifier = new EE();
    notifier.when = notifier.once;
    beforeEach(function(done) {
      notifications = [];
      notifier.removeAllListeners();
      client.presence('test').on(function(message) {
        message.ts = Date.now();
        notifications.push(message);
        notifier.emit(notifications.length);
      }).subscribe(function() { done(); });
    });

    describe('for incoming online messages,', function() {
      it('should emit offlines if sentry times out', function(done) {
        this.timeout(8000);
        var validate = function() {
          var ts = [];
          notifications.forEach(function(n) {
            ts.push(n.ts);
            delete n.ts;
          });
          assert.equal(notifications.length, 4);
          assert.deepEqual(notifications[0], { to: 'presence:/dev/test', op: 'online', value: { '100': 2 } });
          assert.deepEqual(notifications[1], { to: 'presence:/dev/test',
            op: 'client_online',
            value: { userId: 100, clientId: 'abc', userData: { name: 'tester' } }
          });
          assert.deepEqual(notifications[2], { to: 'presence:/dev/test',
                op: 'client_offline',
                explicit: false,
                value: { userId: 100, clientId: 'abc' }
          });
          assert.deepEqual(notifications[3], { to: 'presence:/dev/test',
                op: 'offline',
                value: { '100': 2 }
          });
          assert.ok((ts[2] - ts[1]) >= 3000, 'sentry expiry was '+(ts[2] - ts[1])); //sentry expiry = 4000
          assert.ok((ts[2] - ts[1]) < 6000, 'sentry expiry was '+(ts[2] - ts[1])); //sentry expiry = 4000
          assert.ok((ts[3] - ts[2]) >= 900, 'user expiry was '+(ts[3] - ts[2])); //user expiry = 1000
          assert.ok((ts[3] - ts[2]) < 2000, 'user expiry was '+(ts[3] - ts[2])); //user expiry = 1000
          done();
        };
        presenceManager.addClient('abc', 100, 2, { name: 'tester' });
        notifier.when(4, validate);
      });

      it('should still be online if sentry is alive', function(done) {
        this.timeout(6000);
        var validate = function() {
          var ts = [];
          notifications.forEach(function(n) {
            ts.push(n.ts);
            delete n.ts;
          });
          assert.equal(notifications.length, 2);
          assert.deepEqual(notifications[0], { to: 'presence:/dev/test', op: 'online', value: { '100': 2 } });
          assert.deepEqual(notifications[1], { to: 'presence:/dev/test',
            op: 'client_online',
            value: { userId: 100, clientId: 'abc', userData: { name: 'tester' } }
          });
          done();
        };
        presenceManager.addClient('abc', 100, 2, { name: 'tester' });
        setTimeout(function() {
          sentry.publishKeepAlive(); //renew sentry
        }, 2000);
        notifier.when(2, function() {
          setTimeout(validate, 5000);
        });
      });

      describe('from legacy servers, ', function() {
        it('should emit offlines if autopub does not arrive', function(done) {
          this.timeout(8000);
          var validate = function() {
            var ts = [];
            notifications.forEach(function(n) {
              ts.push(n.ts);
              delete n.ts;
            });
            assert.equal(notifications.length, 4);
            assert.deepEqual(notifications[0], { to: 'presence:/dev/test', op: 'online', value: { '100': 2 } });
            assert.deepEqual(notifications[1], { to: 'presence:/dev/test',
              op: 'client_online',
              value: { userId: 100, clientId: 'abc', userData: { name: 'tester' } }
            });
            assert.deepEqual(notifications[2], { to: 'presence:/dev/test',
              op: 'client_offline',
              explicit: false,
              value: { userId: 100, clientId: 'abc' }
            });
            assert.deepEqual(notifications[3], { to: 'presence:/dev/test',
              op: 'offline',
              value: { '100': 2 }
            });
            assert.ok((ts[2] - ts[1]) >= 3000, 'sentry expiry was '+(ts[2] - ts[1])); //sentry expiry = 4000
            assert.ok((ts[3] - ts[2]) >= 900, 'user expiry was '+(ts[3] - ts[2])); //user expiry = 1000
            assert.ok((ts[3] - ts[2]) >= 900, 'user expiry was '+(ts[3] - ts[2])); //user expiry = 1000
            assert.ok((ts[3] - ts[2]) < 1900, 'user expiry was '+(ts[3] - ts[2])); //user expiry = 1000
            done();
          };
          delete sentry.name;
          presenceManager.stampExpiration = function(m) {
            m.at = Date.now();
          };
          presenceManager.addClient('abc', 100, 2, { name: 'tester' });
          notifier.when(4, validate);
        });

        it('should still be online if sentry is alive', function(done) {
          this.timeout(6000);
          var validate = function() {
            var ts = [];
            notifications.forEach(function(n) {
              ts.push(n.ts);
              delete n.ts;
            });
            assert.equal(notifications.length, 2);
            assert.deepEqual(notifications[0], { to: 'presence:/dev/test', op: 'online', value: { '100': 2 } });
            assert.deepEqual(notifications[1], { to: 'presence:/dev/test',
              op: 'client_online',
              value: { userId: 100, clientId: 'abc', userData: { name: 'tester' } }
            });
            done();
          };
          delete sentry.name;
          presenceManager.stampExpiration = function(m) {
            m.at = Date.now();
          };
          presenceManager.addClient('abc', 100, 2, { name: 'tester' });
          setTimeout(function() {
            //send an autopub message
            presenceManager.addClient('abc', 100, 2, { name: 'tester' });
          }, 2000);
          notifier.when(2, function() {
            setTimeout(validate, 5000);
          });
        });
      });

    });
  });
});
