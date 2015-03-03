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
  var presenceManager = new PresenceManager('presence:/dev/test', {}, sentry);
  var publish_client_online = function(client) {
    var userOpts = { userId: client.userId, userType: client.userType, userData: client.userData, state: null };
    presenceManager.addClient(client.clientId, userOpts);
  };
  var publish_autopub = function(client) {
    delete sentry.name;
    var original = presenceManager.stampExpiration;
    presenceManager.stampExpiration = function(m) {
      m.at = Date.now();
    };
    publish_client_online(client);
    //restore
    sentry.name = 'test-sentry';
    delete presenceManager.stampExpiration; //restore from prototype
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
    p = new PresenceAssert('dev', 'test');
    p.client = { userId: 100, clientId: 'abc', userData: { name: 'tester' }, userType: 2 };
    sentry.publishKeepAlive(); //set ourselves alive
    var track = Tracker.create('beforeEach', done);
    client = common.getClient('dev', 123, 0, { name: 'tester' }, track('client 1 ready'));
  });

  afterEach(function(done) {
    p.teardown();
    client.presence('test').set('offline').removeAllListeners();
    client.dealloc('test');
    Persistence.delWildCard('*',done);
  });

  describe('when listening to a presence,', function() {
    beforeEach(function(done) {
      client.presence('test').on(p.notify).subscribe(function() {
        done();
      });
    });

    describe('for incoming online messages,', function() {
      it('should emit offlines if sentry times out', function(done) {
        this.timeout(8000);
        var validate = function() {
          var ts = p.times;
          p.assert_message_sequence(['online', 'client_online', 'client_implicit_offline', 'offline']);
          assert.ok((ts[2] - ts[1]) >= 3000, 'sentry expiry was '+(ts[2] - ts[1])); //sentry expiry = 4000
          assert.ok((ts[2] - ts[1]) < 6000, 'sentry expiry was '+(ts[2] - ts[1])); //sentry expiry = 4000
          assert.ok((ts[3] - ts[2]) >= 900, 'user expiry was '+(ts[3] - ts[2])); //user expiry = 1000
          assert.ok((ts[3] - ts[2]) < 2000, 'user expiry was '+(ts[3] - ts[2])); //user expiry = 1000
          done();
        };

        publish_client_online(p.client);
        p.on(4, validate);
      });

      it('should still be online if sentry is alive', function(done) {
        this.timeout(6000);
        var validate = function() {
          p.assert_message_sequence(['online', 'client_online']);
          done();
        };

        publish_client_online(p.client);
        setTimeout(function() {
          sentry.publishKeepAlive(); //renew sentry
        }, 2000);

        p.fail_on_more_than(2);
        p.once(2, function() {
          setTimeout(validate, 5000);
        });
      });

      describe('from legacy servers, ', function() {
        it('should emit offlines if autopub does not arrive', function(done) {
          this.timeout(8000);
          var validate = function() {
            var ts = p.times;
            p.assert_message_sequence(['online', 'client_online', 'client_implicit_offline', 'offline']);

            assert.ok((ts[2] - ts[1]) >= 3000, 'sentry expiry was '+(ts[2] - ts[1])); //sentry expiry = 4000
            assert.ok((ts[3] - ts[2]) >= 900, 'user expiry was '+(ts[3] - ts[2])); //user expiry = 1000
            assert.ok((ts[3] - ts[2]) >= 900, 'user expiry was '+(ts[3] - ts[2])); //user expiry = 1000
            assert.ok((ts[3] - ts[2]) < 1900, 'user expiry was '+(ts[3] - ts[2])); //user expiry = 1000
            done();
          };

          //simulate autopub
          publish_autopub(p.client);

          p.once(4, validate);
        });

        it('should still be online if sentry is alive', function(done) {
          this.timeout(6000);
          var validate = function() {
            p.assert_message_sequence(['online', 'client_online']);
            done();
          };

          //simulate autopub
          publish_autopub(p.client);

          setTimeout(function() {
            //send an autopub message
            publish_autopub(p.client);
          }, 2000);

          p.fail_on_more_than(2);
          p.once(2, function() {
            setTimeout(validate, 5000);
          });
        });
      });
    });
  });
});
