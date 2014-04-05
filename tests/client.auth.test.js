var http = require('http'),
  assert = require('assert'),
  Radar = require('../server/server.js'),
  Client = require('radar_client').constructor,
  Type = require('../core').Type,
  common = require('./common.js'),
  Tracker = require('callback_tracker'),
  Persistence = require('../core/lib/persistence.js');
var radar;

exports['auth test'] = {
  before: function(done) {
    var self = this;
    radar = common.spawnRadar();
    radar.sendCommand('start', common.configuration, function() {
      self.client = common.getClient('client_auth', 111, 0,
        { name: 'tester0' }, done);
    });
  },

  afterEach: function() {
    this.client.message('test').removeAllListeners();
  },

  after: function(done){
    this.client.dealloc('test');
    radar.sendCommand('stop', {}, function() {
      radar.kill();
      done();
    });
  },

  // GET /radar/message?accountName=test&scope=chat/1
  'should not succeed if type is disabled (should return err message)': function(done) {
    var self = this;

    this.client.on('err', function(message) {
      assert.ok(message.origin);
      assert.equal(message.origin.op, 'subscribe');
      assert.equal(message.origin.to, 'message:/client_auth/disabled');
      done();
    });

    //Messages of the form 'disabled' are disabled
    self.client.message('disabled').subscribe();
  },

  'should  succeed if type is enabled, no err message emitted': function(done) {
    var self = this;
    var originalMessage = { hello: 'world', timestamp: Date.now()};

    this.client.message('enabled').on(function(message) {
      assert.deepEqual(message.value, originalMessage);
      done();
    });

    this.client.on('err', function(message) {
      assert.ok(false);
    });

    //Messages of the form 'disabled' are disabled
    self.client.message('enabled').subscribe().publish(originalMessage);
  },
};
