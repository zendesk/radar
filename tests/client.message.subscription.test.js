var common = require('./common.js'),
    assert = require('assert'),
    Persistence = require('../core').Persistence,
    Client = require('radar_client').constructor,
    Tracker = require('callback_tracker'),
    radar, client, client2;

exports['message subscriptions:'] = {
  before: function(done) {
    var track = Tracker.create('before', done);

    radar = common.spawnRadar();
    radar.sendCommand('start', common.configuration,  function() {
      client = common.getClient('dev', 123, 0, {}, track('client 1 ready'));
      client2 = common.getClient('dev', 246, 0, {}, track('client 2 ready'));

    });
  },

  after: function(done) {
    client.dealloc('test');
    client2.dealloc('test');
    radar.sendCommand('stop', {}, function() {
      radar.kill();
      done();
    });
  },

  beforeEach: function(done) {
    client.message('test').removeAllListeners();
    client2.message('test').removeAllListeners();
    var track = Tracker.create('before each', done);

    client.message('test').unsubscribe(track('client unsubscribe'));
    client2.message('test').unsubscribe(track('client2 unsubscribe'));
    common.startPersistence(track('redis cleanup'));
  },

  'should subscribe successfully': function(done) {
    client.message('test').subscribe(function(message) {
      assert.equal('subscribe', message.op);
      assert.equal('message:/dev/test', message.to);
      done();
    });
  },

  'should unsubscribe successfully': function(done) {
    client.message('test').unsubscribe(function(message) {
      assert.equal('unsubscribe', message.op);
      assert.equal('message:/dev/test', message.to);
      done();
    });
  },

    // sending a message should only send to each subscriber, but only once
  'should receive a message only once per subscriber': function(done) {
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
  },

  'should only receive message when subscribed': function(done) {
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
  },

  'should not receive messages after unsubscribe': function(done) {
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
  }
};
