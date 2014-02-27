var common = require('./common.js'),
    assert = require('assert'),
    Persistence = require('../core').Persistence,
    Client = require('radar_client').constructor,
    configuration = require('./configuration.js'),
    Tracker = require('callback_tracker');

exports['given two clients'] = {
  before: function(done) { common.startRadar(this, done); },

  after: function(done) { common.endRadar(this, done); },

  beforeEach: function(done) {
    var self = this, track = Tracker.create('before each', done);
    this.client = common.getClient('dev', 123, 0, {}, track('client 1 ready', function() {
      self.client.message('test').subscribe(track('client 1 subscribe'));
    }));

    this.client2 = common.getClient('dev', 246, 0, {}, track('client 2 ready'));

    Persistence.delWildCard('*', track('cleanup redis'));
  },

    // sending a message should only send to each subscriber, but only once
  'should receive a message only once per subscriber': function(done) {
    var client = this.client, client2 = this.client2,
        message = { state: 'test1'},
        assertions = 0;
    client2.once('ready', function() {
      client.message('test').on(function(msg) {
        assert.equal('message:/dev/test', msg.to);
        assert.equal(message.state, msg.value.state);
        assertions += 2;
      });
      client2.message('test').on(function(msg) {
        assert.equal('message:/dev/test', msg.to);
        assert.equal(message.state, msg.value.state);
        assertions += 2;
      });
      common.radar().once('subscribe', function() {
        client.message('test').publish(message);
        setTimeout(function() {
          assert.equal(4, assertions);

          client.message('test').removeAllListeners();
          client2.message('test').removeAllListeners();
          done();
        }, 50); // 50 ms at most
      });
      client2.message('test').subscribe();
    });
    client2.alloc('test');
  },

  // only subscribers to a channel should be notified of messages to that channel
  'should only receive message when subscribed': function(done) {
    var client = this.client, client2 = this.client2,
        message = { state: 'test2'},
        assertions = 0;
    client2.once('ready', function() {
      client2.message('test').on(function(msg) {
        if(msg.value.state == 'test2') {
          assert.ok(false);
          assertions++;
        }
      });
      client.message('test').on(function(msg) {
        if(msg.value.state == 'test2') {
          assert.ok(true);
          assertions++;
        }
      });
      client.message('test').publish(message);
      setTimeout(function() {
        assert.equal(1, assertions);
        client.message('test').removeAllListeners();
        client2.message('test').removeAllListeners();
        done();
      }, 100); // 100 ms at most
    });
    client2.alloc('test');
  },

  // unsubscribing should cause that client not to receive messages
  'can unsubscribe': function(done) {
    var client = this.client, client2 = this.client2;
    var message = { state: 'test3'};
    var message2 = { state: 'test4'};

    // test.numAssertions = 3;
    client2.once('ready', function() {
      common.radar().once('subscribe', function() {
        client.message('test').publish(message);
      });
      client2.message('test').on(function(msg) {
        if(msg.value.state == 'test3') {
          assert.ok(true);
          client2.message('test').unsubscribe(function() { });
        }
        if(msg.value.state == 'test4') {
          assert.ok(false);
        }
      });
      client.message('test').on(function(msg) {
        if(msg.value.state == 'test3') {
          assert.ok(true);
        }
      });
      common.radar().once('unsubscribe', function() {
        client.message('test').publish(message2);
        setTimeout(function() {
          client.message('test').removeAllListeners();
          client2.message('test').removeAllListeners();
          done();
        }, 50); // 100 ms at most
      });
      client2.message('test').subscribe(function() { });
    });
    client2.alloc('test');
  }

};
