var common = require('./common.js'),
    assert = require('assert'),
    Client = require('radar_client').constructor,
    Tracker = require('callback_tracker'),
    radar, client;

describe('Once radar server is running', function() {
  before(function(done) {
    var track = Tracker.create('before', done);

    radar = common.spawnRadar();
    radar.sendCommand('start', common.configuration,  function() {
      client = common.getClient('dev', 123, 0, {}, track('client 1 ready'));
    });
  });

  afterEach(function() {
    client.dealloc('test');
  });

  after(function(done) {
    common.stopRadar(radar, done);
  });

  it('a client can nameSync successfully with ack', function(done) {
    var association = { id: 1, name: 'test_name' };
    var options = { association: association, clientVersion: '1.0.0' };

    client.control('test').nameSync(options, function(msg) {
      assert.equal('nameSync', msg.op);
      assert.equal('control:/dev/test', msg.to);
      done();
    });
  });
});
