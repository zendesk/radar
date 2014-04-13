var common = require('./common.js'),
    assert = require('assert'),
    Persistence = require('../core').Persistence,
    Client = require('radar_client').constructor,
    Tracker = require('callback_tracker'),
    radar, client, client2;

describe('given two clients', function() {
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
    radar.sendCommand('stop', {}, function() {
      radar.kill();
      done();
    });
  });

  beforeEach(function(done) {
    client.status('test').removeAllListeners();
    client2.status('test').removeAllListeners();

    var track = Tracker.create('before each', done);
    client.status('test').unsubscribe(track('client unsubscribe'));
    client2.status('test').unsubscribe(track('client2 unsubscribe'));
    common.startPersistence(track('redis cleanup'));
  });

  it('should subscribe successfully', function(done) {

    client.status('test').subscribe(function(msg) {
      assert.equal('subscribe', msg.op);
      assert.equal('status:/dev/test', msg.to);
      done();
    });
  });

  it('should unsubscribe successfully', function(done) {

    client.status('test').unsubscribe(function(msg) {
      assert.equal('unsubscribe', msg.op);
      assert.equal('status:/dev/test', msg.to);
      done();
    });
  });

  // sending a message should only send to each subscriber, but only once
  it('should receive a message only once per subscriber', function(done) {
    var message = { state: 'test1'};

    var finished = {};

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
// Status tests
// - .set/get(value, ack) [string]
// - .set/get(value, ack) [object]
// - .subscribe(ack)
// - .unsubscribe(ack)
// - .sync(callback)

  it('status can set and get([String])', function(done) {

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

  it('status can set and get([Object])', function(done) {
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


  it('status can subscribe()', function(done) {
    this.timeout(10000);

    client2.status('test')
      .once(function(message) {
        assert.equal('set', message.op);
        assert.equal('foo', message.value);
        assert.equal('123', message.key);
        done();
      })
    .subscribe(function() {
      client.status('test').set('foo');
    });
  });


  it('status can sync()', function(done) {

    client.status('test').set('foo', function() {
      client.status('test').sync(function(message) {
        // sync is implemented as subscribe + get, hence the return op is "get"
        assert.equal('get', message.op);
        assert.deepEqual({ 123: 'foo'}, message.value);
        done();
      });
    });
  });
});
