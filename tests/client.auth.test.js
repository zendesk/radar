var http = require('http'),
    assert = require('assert'),
    Radar = require('../server/server.js'),
    Client = require('radar_client').constructor,
    Type = require('../core').Type,
    common = require('./common.js'),
    Tracker = require('callback_tracker'),
    Persistence = require('../core/lib/persistence.js');

var radar, client;

exports['auth test'] = {
  before: function(done) {
    radar = common.spawnRadar();
    radar.sendCommand('start', common.configuration, function() {
      client = common.getClient('client_auth', 111, 0,
        { name: 'tester0' }, done);
    });
  },

  afterEach: function() {
    client.message('test').removeAllListeners();
  },

  after: function(done){
    client.dealloc('test');
    radar.sendCommand('stop', {}, function() {
      radar.kill();
      done();
    });
  },

  // GET /radar/message?accountName=test&scope=chat/1
  'should emit err event if type is disabled': function(done) {

    client.on('err', function(message) {
      assert.ok(message.origin);
      assert.equal(message.origin.op, 'subscribe');
      assert.equal(message.origin.to, 'message:/client_auth/disabled');
      setTimeout(done, 10);
    });

    //Messages of the form 'disabled' are disabled
    client.message('disabled').subscribe(function() {
      assert.ok(false);
    });
  },

  'should work if type is enabled': function(done) {
    var originalMessage = { hello: 'world', timestamp: Date.now()};

    client.message('enabled').on(function(message) {
      assert.deepEqual(message.value, originalMessage);
      assert.equal(message.to,'message:/client_auth/enabled');
      done();
    });

    client.on('err', function(message) {
      assert.ok(false);
    });

    //Messages of the form 'disabled' are disabled
    client.message('enabled').subscribe().publish(originalMessage);
  },
};
