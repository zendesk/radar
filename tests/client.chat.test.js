var common = require('./common.js'),
    assert = require('assert'),
    Radar = require('../server/server.js'),
    Persistence = require('../core').Persistence,
    Client = require('radar_client').constructor;

exports['given two clients'] = {
  before: function(done) { common.startRadar(8001, this, done); },

  after: function(done) { common.endRadar(this, function() { Persistence.disconnect(done); }); },

  beforeEach: function(done) {
    var self = this, tasks = 0;
    function next() { tasks++ && (tasks == 4) && done(); }
    this.client = new Client()
                  .configure({ userId: 123, userType: 0, accountName: 'dev', port: 8001, upgrade: false})
                  .once('ready', function() { self.client.message('test').subscribe(next); })
                  .alloc('test');
    this.client2 = new Client()
                  .configure({ userId: 246, userType: 0, accountName: 'dev', port: 8001, upgrade: false})
                  .once('ready', next).alloc('test');

    Persistence.del('status:/dev/voice/status', next);
    Persistence.del('presence:/dev/ticket/21', next);
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
      common.radar().once('subscribe', function(c, msg) {
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
      common.radar().once('subscribe', function(c, msg) {
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
      common.radar().once('unsubscribe', function(c, msg) {
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

// if this module is the script being run, then run the tests:
if (module == require.main) {
  var mocha = require('child_process').spawn('mocha', [ '--colors', '--ui', 'exports', '--reporter', 'spec', __filename ]);
  mocha.stdout.pipe(process.stdout);
  mocha.stderr.pipe(process.stderr);
}
