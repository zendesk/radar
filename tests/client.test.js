var common = require('./common.js'),
    assert = require('assert'),
    Persistence = require('../core').Persistence,
    minilog = require('minilog'),
    Client = require('radar_client').constructor,
    Tracker = require('callback_tracker'),
    radar;

exports['given a server'] = {

  before: function(done) {
    radar = common.spawnRadar();
    radar.sendCommand('start', common.configuration, done);
  },

  after: function(done) {
    radar.sendCommand('stop', {}, function() {
      radar.kill();
      done();
    });
  },

  beforeEach: function(done) {
    this.client = common.getClient('dev', 123, 0, {}, done);
  },

  afterEach: function() {
    this.client.presence('client-test').removeAllListeners();
    this.client.message('client-test').removeAllListeners();
    this.client.status('client-test').removeAllListeners();
    this.client.dealloc('test');
  },



// Status tests
// - .set/get(value, ack) [string]
// - .set/get(value, ack) [object]
// - .subscribe(ack)
// - .unsubscribe(ack)
// - .sync(callback)

  'status: can set and get([String])': function(done) {
    var client = this.client;

    var once_set = function() {
      client.status('client-test').get(function(message) {
        assert.equal('get', message.op);
        assert.equal('status:/dev/client-test', message.to);
        assert.deepEqual({ '123': 'foo' }, message.value);
        done();
      });
    };
    client.status('client-test').set('foo', once_set);
  },

  'status: can set and get([Object])': function(done) {
    var client = this.client;
    var once_set = function() {
      client.status('client-test').get(function(message) {
        assert.equal('get', message.op);
        assert.equal('status:/dev/client-test', message.to);
        assert.deepEqual({ '123': { hello: 'world' } }, message.value);
        done();
      });
    };
    client.status('client-test').set({ hello: 'world' }, once_set);
  },


  'status: can subscribe()': function(done) {
    this.timeout(10000);

    var client = this.client;
    var client2 = common.getClient('dev', 234, 0, {}, function() {
        client2.status('client-test')
          .once(function(message) {
            assert.equal('set', message.op);
            assert.equal('foo', message.value);
            assert.equal('123', message.key);
            client2.dealloc('test');
            done();
          })
          .subscribe(function() {
            client.status('client-test').set('foo');
          });
      });
  },


  'status: can sync()': function(done) {
    var client = this.client;

    this.client.status('client-test').set('foo', function() {
      client.status('client-test').sync(function(message) {
        // sync is implemented as subscribe + get, hence the return op is "get"
        assert.equal('get', message.op);
        assert.deepEqual({ 123: 'foo'}, message.value);
        done();
      });
    });
  }
};
