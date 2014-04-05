var common = require('./common.js'),
    assert = require('assert'),
    Persistence = require('../core').Persistence,
    Client = require('radar_client').constructor,
    Tracker = require('callback_tracker'),
    radar;

exports['message subscriptions:'] = {
  before: function(done) {
    var self = this;
    var track = Tracker.create('before', done);

    radar = common.spawnRadar();
    radar.sendCommand('start', common.configuration,  function() {
      self.client = common.getClient('dev', 123, 0, {}, track('client 1 ready'));
      self.client2 = common.getClient('dev', 246, 0, {}, track('client 2 ready'));

    });
  },

  after: function(done) {
    this.client.dealloc('test');
    this.client2.dealloc('test');
    radar.sendCommand('stop', {}, function() {
      radar.kill();
      done();
    });
  },

  beforeEach: function(done) {
    this.client.message('test').removeAllListeners();
    this.client2.message('test').removeAllListeners();
    var track = Tracker.create('before each', done);

    this.client.message('test').unsubscribe(track('client unsubscribe'));
    this.client2.message('test').unsubscribe(track('client2 unsubscribe'));
    common.startPersistence(track('redis cleanup'));
  },

  'should subscribe successfully': function(done) {
    this.client.message('test').subscribe(function() {
      done();
    });
  },

  'should unsubscribe successfully': function(done) {
    this.client.message('test').unsubscribe(function() {
      done();
    });
  },

    // sending a message should only send to each subscriber, but only once
  'should receive a message only once per subscriber': function(done) {
    var client = this.client, client2 = this.client2,
        message = { state: 'test1'},
        assertions = 0;

    var wait = function() {
      assertions += 2;
      if(assertions == 4) {
        setTimeout(function() {
          assert.equal(4, assertions);
          done();
        }, 50); //wait 50 ms after all callbacks
      }
    };

    client.message('test').on(function(msg) {
      assert.equal('message:/dev/test', msg.to);
      assert.equal('publish', msg.op);
      assert.equal(message.state, msg.value.state);
      wait();
    });
    client2.message('test').on(function(msg) {
      assert.equal('message:/dev/test', msg.to);
      assert.equal('publish', msg.op);
      assert.equal(message.state, msg.value.state);
      wait();
    });

    client.message('test').subscribe(function() {
      client2.message('test').subscribe(function() {
        client.message('test').publish(message);
      });
    });
  },

  // only subscribers to a channel should be notified of messages to that channel
  'should only receive message when subscribed': function(done) {
    var client = this.client, client2 = this.client2,
        message = { state: 'test2'},
        assertions = 0;

    client2.message('test').on(function(msg) {
      if(msg.value.state == 'test2') {
        assert.ok(false);
      }
    });

    client.message('test').on(function(msg) {
      if(msg.value.state == 'test2') {
        assert.ok(true);
        assertions++;
        if(assertions == 1) {
          setTimeout(function() {
            assert.equal(1, assertions);
            done();
          }, 50); // 100 ms at most
        }
      }
    });

    client.message('test').subscribe(function() {
      client.message('test').publish(message);
    });

  },

  // unsubscribing should cause that client not to receive messages
  'should not receive messages after unsubscribe': function(done) {
    var client = this.client, client2 = this.client2;
    var message = { state: 'test3'};
    var message2 = { state: 'test4'};

    // test.numAssertions = 3;
    client2.message('test').on(function(msg) {
      if(msg.value.state == 'test3') {
        client2.message('test').unsubscribe(function() {
          client.message('test').publish(message2);
          setTimeout(function() {
            done();
          }, 50); // 50 ms at most
        });
      }

      if(msg.value.state == 'test4') {
        assert.ok(false);
      }
    });

    client2.message('test').subscribe(function() {
      client.message('test').publish(message);
    });
  }
};
