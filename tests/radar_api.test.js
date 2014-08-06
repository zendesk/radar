/* globals describe, it, before, after */
var assert = require('assert'),
    core = require('../core'),
    Persistence = core.Persistence,
    common = require('./common.js'),
    request = require('request'),
    RadarClient = require('radar_client'),
    //logger = require('minilog')('radar:test_api'),
    API_PATH = 'http://localhost:' + common.configuration.port + '/api',
    radar;


function retrieve(data, fn) {
  return request.post(API_PATH, { json: data }, function(error, response) {
    if (error) {
      throw error;
    }
    fn.call(this, response.body);
  });
}

describe('Radar api tests', function() {
  before(function(done) {
    common.startPersistence(function() {
      radar = common.spawnRadar();
      radar.sendCommand('start', common.configuration,  function() {
        done();
      });
    });
  });

  after(function(done) {
    common.stopRadar(radar, function() {
      common.endPersistence(done);
    });
  });

  it('can set a status scope', function(done) {
    var name = 'status:/test/ticket/2';
    retrieve({ op: 'set', to: name, key: 'foo', value: 'bar', ack: 21 }, function(response) {
      assert.deepEqual({ op: 'ack', value: 21 }, response);
      Persistence.ttl(name, function(err, reply) {
        assert.ok((parseInt(reply, 10) > 0));
        done();
      });
    });
  });

  it('can get a status scope', function(done) {
    var name = 'status:/test/ticket/2';
    retrieve({ op: 'get', to: name }, function(response) {
      assert.deepEqual({ op: 'get', to: name, value: { foo: 'bar' } }, response);
      done();
    });
  });

  it('can publish a message scope', function(done) {
    var name = 'message:/test/chat/2';
    retrieve({ op: 'publish', to: name, value: 'hello', ack: 22 }, function(response) {
      assert.deepEqual({ op: 'ack', value: 22 }, response);
      Persistence.ttl(name, function(err, reply) {
        assert.ok((parseInt(reply, 10) > 0));
        done();
      });
    });
  });

  it('can get a message scope', function(done) {
    var name = 'message:/test/chat/2';
    retrieve({ op: 'get', to: name }, function(response) {
      assert.equal(response.op, 'get');
      assert.equal(response.to, name);
      assert.deepEqual({ op: 'publish', to: name, value: 'hello', ack: 22 }, JSON.parse(response.value[0]));
      assert(response.value[1] > Date.now()-100);
      done();
    });
  });

  describe('for a client presence', function() {
    before(function(done) {
      RadarClient.configure({
        host: 'localhost',
        port: common.configuration.port,
        accountName: 'test',
        userId: 123,
        userType: 4,
        userData: {
          name: 'joe'
        }
      }).alloc('test', done);
    });

    it('can get and set a presence scope with version 2', function(done) {
      var name = 'presence:/test/ticket/1';
      RadarClient.presence('ticket/1').set('online', function() {
        retrieve({ op: 'get', to: name, options: { version: 2 } }, function(response) {
          assert.equal(response.op, 'get');
          assert.equal(response.to, name);
          var clientData = response.value[123].clients[RadarClient.currentClientId()];
          assert.deepEqual({ name: 'joe' }, clientData);
          Persistence.ttl(name, function(err, reply) {
            assert.ok((parseInt(reply, 10) > 0));
            done();
          });
        });
      });
    });

    it('can get and set a presence scope', function(done) {
      var name = 'presence:/test/ticket/2';
      RadarClient.presence('ticket/2').set('online', function() {
        retrieve({ op: 'get', to: name }, function(response) {
          assert.equal(response.op, 'get');
          assert.equal(response.to, name);
          assert.deepEqual({ 123: 4 }, response.value);
          Persistence.ttl(name, function(err, reply) {
            assert.ok((parseInt(reply, 10) > 0));
            done();
          });
        });
      });
    });
  });
});
