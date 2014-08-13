/* globals describe, it, before, after, beforeEach */
var assert = require('assert'),
    http = require('http'),
    core = require('../core'),
    Persistence = core.Persistence,
    common = require('./common.js'),
    request = require('request'),
    RadarClient = require('radar_client'),
    collect = require('collect-stream'),
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

function respond(json, outgoing) {
  if (!json) {
    return outgoing.end();
  }
  var data = JSON.stringify(json);
  outgoing.setHeader('Content-Type', 'application/json');
  outgoing.end(data);
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

  describe('can accept subscriptions via webhooks', function() {
    var subscribingServer, handler, PORT = 9013, scope = 'status:/test/chat/1';

    before(function(done) {
      subscribingServer = http.createServer(function(incoming, outgoing) {
        if (incoming.method == 'POST') {
          collect(incoming, function(error, data) {
            handler(incoming, outgoing, JSON.parse(data.toString()));
          });
        }
      });

      subscribingServer.listen(PORT, done);
    });

    beforeEach(function() {
      handler = function(i, o) {
        o.end();
      };
    });

    after(function(done) {
      if(subscribingServer) {
        subscribingServer.close(done);
      } else {
        done();
      }
    });

    it('should subscribe to a resource', function(done) {
      retrieve({ op: 'subscribe', to: scope, url: 'http://localhost:' + PORT + '/radar-update', ack: 32 }, function(response) {
        assert.deepEqual({ op: 'ack', value: 32 }, response);
        done();
      });
    });

    it('should receive updates via a webhook', function(done) {
      handler = function(incoming, outgoing, data) {
        assert.equal(incoming.url, '/radar-update');
        assert(data.client);
        delete data.client;
        assert.deepEqual({ op: 'set', to: scope, key: 908, value: 'new status update', ack: 33 }, data);
        respond({ ack: true }, outgoing);
        done();
      };

      retrieve({ op: 'set', to: scope, key: 908, value: 'new status update', ack: 33 }, function(response) {
        assert.deepEqual({ op: 'ack', value: 33 }, response);
      });
    });

    it('should get a full response from a sync', function(done) {
      retrieve({ op: 'sync', to: scope, url: 'http://localhost:' + PORT + '/radar-update', ack: 36 }, function(response) {
        assert.deepEqual({ op: 'get', to: scope, value: { 908: 'new status update' } }, response);
        done();
      });
    });
  });
});
