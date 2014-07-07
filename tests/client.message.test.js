var common = require('./common.js'),
    assert = require('assert'),
    Persistence = require('../core').Persistence,
    Client = require('radar_client').constructor,
    Tracker = require('callback_tracker');

describe('When using message list resources:', function() {
  var radar, client, client2;

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
    client.message('test').removeAllListeners();
    client2.message('test').removeAllListeners();
    client.message('cached_chat/1').removeAllListeners();
    client2.message('cached_chat/1').removeAllListeners();

    var track = Tracker.create('before each', done);

    client.message('test').unsubscribe(track('client unsubscribe'));
    client2.message('test').unsubscribe(track('client2 unsubscribe'));

    client.message('cached_chat/1').unsubscribe(track('cached chat unsubscribe client1'));
    client2.message('cached_chat/1').unsubscribe(track('cached chat unsubscribe client2'));
    common.startPersistence(track('redis cleanup'));
  });

  describe('subscribe/unsubscribe', function() {

    it('should subscribe successfully with an ack', function(done) {
      client.message('test').subscribe(function(message) {
        assert.equal('subscribe', message.op);
        assert.equal('message:/dev/test', message.to);
        done();
      });
    });

    it('should unsubscribe successfully with an ack', function(done) {
      client.message('test').unsubscribe(function(message) {
        assert.equal('unsubscribe', message.op);
        assert.equal('message:/dev/test', message.to);
        done();
      });
    });

    // sending a message should only send to each subscriber, but only once
    it('should receive a message only once per subscriber', function(done) {
      var message = { state: 'test1'};

      var finished = {};

      function validate(msg, client_name) {
        assert.equal('message:/dev/test', msg.to);
        assert.equal('publish', msg.op);
        assert.equal(message.state, msg.value.state);
        assert.ok( !finished[client_name] );
        finished[client_name] = true;
        if(finished.client && finished.client2) {
          setTimeout(done,30);
        }
      }


      client.message('test').on(function(msg) {
        validate(msg, 'client');
      });
      client2.message('test').on(function(msg) {
        validate(msg, 'client2');
      });

      client.message('test').subscribe();
      client2.message('test').subscribe().publish(message);
    });

    it('should only receive message when subscribed', function(done) {
      //send three messages, client2 will assert if it receieves any,
      //Stop test when we receive all three at client 1

      var message = { state: 'test1'},
          message2 = { state: 'test2' },
          message3 = { state: 'test3' };

      client2.message('test').on(function(msg) {
        assert.ok(false);
      });

      client.message('test').on(function(msg) {
        if(msg.value.state == 'test3') {
          done();
        }
      });

      client.message('test').subscribe().publish(message);
      client2.message('test').publish(message2);
      client.message('test').publish(message3);
    });

    it('should not receive messages after unsubscribe', function(done) {
      //send two messages after client2 unsubscribes,
      // client2 will assert if it receives message 2 and 3
      //Stop test when we receive all three at client 1

      var message = { state: 'test1'};
      var message2 = { state: 'test2'};
      var message3 = { state: 'test3'};

      // test.numAssertions = 3;
      client2.message('test').on(function(msg) {
        assert.equal(msg.value.state, 'test1');
        client2.message('test').unsubscribe().publish(message2);
        client2.message('test').unsubscribe().publish(message3);
      });

      client.message('test').on(function(msg) {
        if(msg.value.state == 'test3') {
          //received third message without asserting
          done();
        }
      });

      client2.message('test').subscribe().publish(message);
      client.message('test').subscribe();
    });

    it('should receive messages in the order of publish', function(done) {
      var messages   = ['1', '2', '3', '4', 'foobar', { foo: 'bar' }],
          received   = [],
          assertions = 0;

      client2.message('cached_chat/1').subscribe().on(function(m) {
        received.push(m);
        if(received.length == 4) {
          setTimeout(verify, 50);
        }
      });

      for(var i = 0; i < messages.length; i++) {
        client2.message('cached_chat/1').publish(messages[i]);
      }

      function verify() {
        assert.equal(messages.length, received.length);
        for(var i = 0; i < received.length; i++) {
          assert.equal('publish', received[i].op);
          assert.deepEqual(messages[i], received[i].value);
          assert.equal('message:/dev/cached_chat/1', received[i].to);
          assert.deepEqual({}, received[i].userData);
        }
        done();
      }
    });
  });

  describe('publish', function() {
    it('can ack a publish', function(done) {
      client.message('test').publish('foobar', function(message) {
        assert.equal('message:/dev/test', message.to);
        assert.equal('foobar', message.value);
        assert.equal('publish', message.op);
        assert.deepEqual({}, message.userData);
        done();
      });
    });

    it('can publish a String', function(done) {
      var message = '{ "state": "other"}';

      client.message('test').when(function(msg) {
        assert.equal('message:/dev/test', msg.to);
        assert.equal('string', typeof msg.value);
        assert.equal('{ "state": "other"}', msg.value);
        done();
      });
      client.message('test').subscribe().publish(message);
    });

    it('can publish an Object', function(done) {
      var message = { state: 'other'};

      client.message('test').when(function(msg) {
        if(msg.value && msg.value.state && msg.value.state == 'other') {
          assert.equal('message:/dev/test', msg.to);
          assert.equal('other', msg.value.state);
          done();
          return true;
        }
        return false;
      });
      client.message('test').subscribe().publish(message);
    });
  });

  describe('sync', function() {
    it('does not notify when empty', function(done) {
      client.message('cached_chat/1').on(function(msg) {
        assert.ok(false);
      }).sync();
      setTimeout(done, 100);
    });

    it('does not provide ack', function(done) {
      var message = 'foobar';
      client2.message('cached_chat/1').subscribe()
                                      .publish(message)
                                      .once(function() {
        client.message('cached_chat/1').on(function(msg) {
          setTimeout(done, 50);
        }).sync(function() {
          assert.ok(false);
        });
      });
    });

    it('can sync() when messagelist has String', function(done) {
      var message = 'foobar',
          assertions = 0;
      client2.message('cached_chat/1').subscribe()
                                      .publish(message)
                                      .once(function() {
        client.message('cached_chat/1').on(function(msg) {
          assert.equal('publish', msg.op);
          assert.equal('message:/dev/cached_chat/1', msg.to);
          assert.deepEqual({}, msg.userData);
          assert.equal('foobar', msg.value);
          assertions++;
          setTimeout(function() {
            assert.equal(1, assertions);
            done();
          }, 50);
        }).sync();
      });
    });

    it('can sync() when messagelist has Object', function(done) {
      var message = { foo: 'bar' },
          assertions = 0;

      client2.message('cached_chat/1').subscribe()
                                      .publish(message)
                                      .once(function() {

        client.message('cached_chat/1').on(function(msg) {
          assert.equal('publish', msg.op);
          assert.equal('message:/dev/cached_chat/1', msg.to);
          assert.deepEqual({}, msg.userData);
          assert.equal('bar', msg.value.foo);
          assertions++;
          setTimeout(function() {
            assert.equal(1, assertions);
            done();
          }, 50);
        }).sync();
      });
    });

    it('can sync() with multiple values in correct order', function(done) {
      var messages   = ['1', '2', '3', '4', 'foobar', { foo: 'bar' }],
          received   = [],
          written    = 0,
          assertions = 0;

      client2.message('cached_chat/1').subscribe().on(function(m) {
        written++;
        if(written == messages.length)
          syncTest();
      });

      for(var i = 0; i < messages.length; i++) {
        client2.message('cached_chat/1').publish(messages[i]);
      }

      function syncTest() {
        client.message('cached_chat/1').on(function(msg) {
          received.push(msg);
          if(received.length == messages.length) {
            setTimeout(function() {
              assert.equal(messages.length, received.length);
              for(var i = 0; i < received.length; i++) {
                assert.equal('publish', received[i].op);
                assert.deepEqual(messages[i], received[i].value);
                assert.equal('message:/dev/cached_chat/1', received[i].to);
                assert.deepEqual({}, received[i].userData);
              }
              done();
            }, 50);
          }
        }).sync();
      }
    });
  });
});
