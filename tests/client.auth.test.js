var http = require('http'),
    assert = require('assert'),
    Radar = require('../server/server.js'),
    Client = require('radar_client').constructor,
    Type = require('../core').Type,
    common = require('./common.js'),
    Tracker = require('callback_tracker'),
    Persistence = require('persistence');

describe('auth test', function() {
  var radar, client;
  before(function(done) {
    radar = common.spawnRadar();
    radar.sendCommand('start', common.configuration, function() {
      client = common.getClient('client_auth', 111, 0,
        { name: 'tester0' }, done);
    });
  });

  afterEach(function(done) {
    client.message('test').removeAllListeners();
    client.removeAllListeners('err');
    common.startPersistence(done);
  });

  after(function(done){
    client.dealloc('test');
    common.stopRadar(radar, done);
  });

  describe('if type is disabled', function() {
    it('subscribe fails and emits err', function(done) {
      client.on('err', function(response) {
        var message = response.getMessage();
        assert.ok(message.origin);
        assert.equal(message.origin.op, 'subscribe');
        assert.equal(message.origin.to, 'message:/client_auth/disabled');
        setTimeout(done, 50);
      });

      // Type client_auth/disabled is disabled in tests/lib/radar.js
      client.message('disabled').subscribe(function() {
        assert.ok(false);
      });
    });

    it('publish fails, emits err and is not persisted', function(done) {
      // Cache policy true for this type
      client.on('err', function(response) {
        var message = response.getMessage();
        assert.ok(message.origin);
        assert.equal(message.origin.op, 'publish');
        assert.equal(message.origin.to, 'message:/client_auth/disabled');
        Persistence.readOrderedWithScores('message:/client_auth/disabled', function(messages) {
          assert.deepEqual([], messages);
          done();
        });
      });

      // Type client_auth/disabled is disabled in tests/lib/radar.js
      client.message('disabled').publish('xyz');
    });
  });

  describe('if type is not disabled', function() {
    it('should work', function(done) {
      var originalMessage = { hello: 'world', timestamp: Date.now()};

      client.message('enabled').on(function(message) {
        assert.deepEqual(message.value, originalMessage);
        assert.equal(message.to,'message:/client_auth/enabled');
        done();
      });

      client.on('err', function(message) {
        assert.ok(false);
      });

      // Messages of the form 'disabled' are disabled
      client.message('enabled').subscribe().publish(originalMessage);
    });
  });
});
