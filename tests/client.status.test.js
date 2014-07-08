var common = require('./common.js'),
    assert = require('assert'),
    Persistence = require('../core').Persistence,
    Client = require('radar_client').constructor,
    Tracker = require('callback_tracker'),
    radar, client, client2;

describe('When using status resources', function() {
  before(function(done) {
    var track = Tracker.create('before', done);

    radar = common.spawnRadar();
    radar.sendCommand('start', common.configuration,  function() {
      client = common.getClient('dev', 123, 0, {}, track('client 1 ready'));
      client2 = common.getClient('dev', 246, 0, {}, track('client 2 ready'));
    });
  });

  after(function(done) {
    client.dealloc('test');
    client2.dealloc('test');
    common.stopRadar(radar, done);
  });

  beforeEach(function(done) {
    client.status('test').removeAllListeners();
    client2.status('test').removeAllListeners();

    var track = Tracker.create('before each', done);
    client.status('test').unsubscribe(track('client unsubscribe'));
    client2.status('test').unsubscribe(track('client2 unsubscribe'));
    common.startPersistence(track('redis cleanup'));
  });

  describe('subscribe/unsubscribe', function() {
    it('should subscribe successfully with ack', function(done) {

      client.status('test').subscribe(function(msg) {
        assert.equal('subscribe', msg.op);
        assert.equal('status:/dev/test', msg.to);
        done();
      });
    });

    it('should unsubscribe successfully with ack', function(done) {
      client.status('test').unsubscribe(function(msg) {
        assert.equal('unsubscribe', msg.op);
        assert.equal('status:/dev/test', msg.to);
        done();
      });
    });

    // sending a message should only send to each subscriber, but only once
    it('should receive a message only once per subscriber', function(done) {
      var message  = { state: 'test1'},
          finished = {};

      function validate(msg, client_name) {
        assert.equal('status:/dev/test', msg.to);
        assert.equal('set', msg.op);
        assert.equal('246', msg.key);
        assert.equal(message.state, msg.value.state);
        assert.ok( !finished[client_name] );
        finished[client_name] = true;
        if(finished.client && finished.client2) {
          setTimeout(done,30);
        }
      }

      client.status('test').on(function(msg) {
        validate(msg, 'client');
      });
      client2.status('test').on(function(msg) {
        validate(msg, 'client2');
      });

      client.status('test').subscribe();
      client2.status('test').subscribe().set(message);
    });

    it('can chain subscribe and on/once', function(done) {
      client.status('test').subscribe().once(function(message) {
        assert.equal('246', message.key);
        assert.equal('foo', message.value);
        done();
      });
      client2.status('test').set('foo');
    });

    it('should only receive message when subscribed', function(done) {
      //send three messages, client2 will assert if it receieves any,
      //Stop test when we receive all three at client 1

      var message = { state: 'test1'},
          message2 = { state: 'test2' },
          message3 = { state: 'test3' };

      client2.status('test').on(function(msg) {
        assert.ok(false);
      });

      client.status('test').on(function(msg) {
        if(msg.value.state == 'test3') {
          done();
        }
      });

      client.status('test').subscribe().set(message);
      client2.status('test').set(message2);
      client.status('test').set(message3);
    });

    it('should not receive messages after unsubscribe', function(done) {
      //send two messages after client2 unsubscribes,
      // client2 will assert if it receives message 2 and 3
      //Stop test when we receive all three at client 1

      var message = { state: 'test1'};
      var message2 = { state: 'test2'};
      var message3 = { state: 'test3'};

      // test.numAssertions = 3;
      client2.status('test').on(function(msg) {
        assert.equal(msg.value.state, 'test1');
        client2.status('test').unsubscribe().set(message2);
        client2.status('test').unsubscribe().set(message3);
      });

      client.status('test').on(function(msg) {
        if(msg.value.state == 'test3') {
          //received third message without asserting
          done();
        }
      });

      client2.status('test').subscribe().set(message);
      client.status('test').subscribe();
    });
  });

  describe('set', function() {
    it('can acknowledge a set', function(done) {
      client.status('test').set('foobar', function(message) {
        assert.equal('set', message.op);
        assert.equal('status:/dev/test', message.to);
        assert.equal('foobar', message.value);
        assert.equal('123', message.key);
        assert.deepEqual({}, message.userData);
        assert.deepEqual(0, message.type);
        done();
      });
    });
    it('can set a String', function(done) {
      client2.status('test').on(function(message) {
        assert.equal('set', message.op);
        assert.equal('status:/dev/test', message.to);
        assert.equal('foo', message.value);
        assert.equal('123', message.key);
        assert.deepEqual({}, message.userData);
        assert.deepEqual(0, message.type);
        done();
      }).subscribe(function() {
        client.status('test').set('foo');
      });
    });
    it('can set an Object', function(done) {
      client2.status('test').on(function(message) {
        assert.equal('set', message.op);
        assert.equal('status:/dev/test', message.to);
        assert.deepEqual({ foo: 'bar' }, message.value);
        assert.equal('123', message.key);
        assert.deepEqual({}, message.userData);
        assert.deepEqual(0, message.type);
        done();
      }).subscribe(function() {
        client.status('test').set({ foo: 'bar' });
      });
    });
  });

  describe('get', function() {
    it('can get a String', function(done) {
      var once_set = function() {
        client.status('test').get(function(message) {
          assert.equal('get', message.op);
          assert.equal('status:/dev/test', message.to);
          assert.deepEqual({ '123': 'foo' }, message.value);
          done();
        });
      };
      client.status('test').set('foo', once_set);
    });

    it('can get an Object', function(done) {
      var once_set = function() {
        client.status('test').get(function(message) {
          assert.equal('get', message.op);
          assert.equal('status:/dev/test', message.to);
          assert.deepEqual({ '123': { hello: 'world' } }, message.value);
          done();
        });
      };
      client.status('test').set({ hello: 'world' }, once_set);
    });

    it('returns {} if not set', function(done) {

      client.status('non-exist').get(function(message) {
        assert.equal('get', message.op);
        assert.equal('status:/dev/non-exist', message.to);
        assert.deepEqual({}, message.value);
        done();
      });
    });
  });

  describe('sync', function() {
    it('calls back with the value, does not notify', function(done) {
      //Make sure redis message has reflected.
      client2.status('test').subscribe().set('foo').once(function() {
        client.status('test').on(function(message) {
          assert.ok(false);
        }).sync(function(message) {
          // sync is implemented as subscribe + get, hence the return op is "get"
          assert.equal('get', message.op);
          assert.deepEqual({ 246: 'foo'}, message.value);
          setTimeout(done,50);
        });
      });
    });
    it('also subscribes', function(done) {
      client.status('test').set('foo', function() {
        client.status('test').on(function(message) {
          assert.equal('set', message.op);
          assert.equal('status:/dev/test', message.to);
          assert.equal('bar', message.value);
          assert.equal('123', message.key);
          assert.deepEqual({}, message.userData);
          assert.deepEqual(0, message.type);
          done();
        }).sync(function(message) {
          // sync is implemented as subscribe + get, hence the return op is "get"
          assert.equal('get', message.op);
          assert.deepEqual({ 123: 'foo'}, message.value);
          client.status('test').set('bar');
        });
      });
    });
    it('can sync a String', function(done) {
      client.status('test').set('foo', function() {
        client.status('test').sync(function(message) {
          // sync is implemented as subscribe + get, hence the return op is "get"
          assert.equal('get', message.op);
          assert.deepEqual({ 123: 'foo'}, message.value);
          done();
        });
      });
    });
    it('can sync an Object', function(done) {
      client.status('test').set({ foo: 'bar' }, function() {
        client.status('test').sync(function(message) {
          // sync is implemented as subscribe + get, hence the return op is "get"
          assert.equal('get', message.op);
          assert.deepEqual({ 123: { foo: 'bar' } }, message.value);
          done();
        });
      });
    });
    it('returns {} when not set', function(done) {
      client.status('test').sync(function(message) {
        // sync is implemented as subscribe + get, hence the return op is "get"
        assert.equal('get', message.op);
        assert.deepEqual({}, message.value);
        done();
      });
    });
  });
});
