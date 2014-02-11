var common = require('./common.js'),
  assert = require('assert'),
  http = require('http'),
  verbose = false,
  Persistence = require('../core').Persistence,
  Client = require('radar_client').constructor,
  logging = require('minilog')('test'),
  Tracker = require('callback_tracker'),
  configuration = require('./configuration.js'),
  client1, client2;

http.globalAgent.maxSockets = 10000;

if (verbose) {
  var Minilog = require('minilog');
  Minilog.pipe(Minilog.backends.nodeConsole)
    .format(Minilog.backends.nodeConsole.formatWithStack);
}

exports['offline presence test: given a server and two connected clients'] = {

  beforeEach: function(done) {
    var track = Tracker.create('before each', done);
    common.startRadar(this, function(){
      client1 = common.getClient('test', 123, 0, {}, track('client 1 ready'));
      client2 = common.getClient('test', 222, 0, {}, track('client 2 ready'));
    });
  },

  afterEach: function(done) {
    client1.dealloc('test');
    client2.dealloc('test');
    common.endRadar(this,done);
  },

  'presence state should only be sent once to clients (slow path)': function(done) {
    // wait more than the 15 seconds so that we're sure the expected behaviour
    // isn't affected by the disconnect queue
    this.timeout(30 * 1000);
    var messagesCount = {};

    setTimeout(function() {
      assert.ok(messagesCount['client_online'], "expected client_online event but did not get it");
      assert.ok(messagesCount['online'], "expected online event but did not get it");
      assert.ok(messagesCount['client_offline'], "expected client_offline event but did not get it");
      assert.ok(messagesCount['offline'], "expected offline event but did not get it");
      done();
    }, 16 * 1000);


    client2.presence('chat/1/participants').on(function(message){
      logging.info('Receive message', message);
      var messageHash = message.op;
      if(!messagesCount[messageHash]) {
        messagesCount[messageHash] = 1;
      } else {
        messagesCount[messageHash] ++;
      }

      assert(messagesCount[messageHash] <= 1, "expected the following operation to be received only once: " + messageHash);

    }).subscribe(function() {
      client1.presence('chat/1/participants').set('online');
      setTimeout(function() {
        client1.dealloc('test');
        client1.manager.close();
      }, 500);
    });
  },

  'presence state should only be sent once to clients (fast path)': function(done) {
    this.timeout(3 * 1000);
    var messagesCount = {};


    setTimeout(function() {
      assert.ok(messagesCount['client_online'], "expected client_online event but did not get it");
      assert.ok(messagesCount['online'], "expected online event but did not get it");
      assert.ok(messagesCount['client_offline'], "expected client_offline event but did not get it");
      assert.ok(messagesCount['offline'], "expected offline event but did not get it");
      done();
    }, 2 * 1000);


    client2.presence('chat/1/participants').on(function(message){
      logging.info('Receive message', message);
      var messageHash = message.op;
      if(!messagesCount[messageHash]) {
        messagesCount[messageHash] = 1;
      } else {
        messagesCount[messageHash] ++;
      }

      assert(messagesCount[messageHash] <= 1, "expected the following operation to be received only once: " + messageHash);

    }).subscribe(function() {
      client1.presence('chat/1/participants').set('online');
      setTimeout(function() {
        client1.presence('chat/1/participants').set('offline');
      }, 500);
    });
  },

  'presence state can switch back to client_online after a client_offline': function(done) {
    this.timeout(3 * 1000);
    var messagesCount = {};


    setTimeout(function() {
      assert.ok(messagesCount['client_online'], "expected client_online event but did not get it");
      assert.ok(messagesCount['online'], "expected online event but did not get it");
      assert.ok(messagesCount['client_offline'], "expected client_offline event but did not get it");
      assert.ok(messagesCount['offline'], "expected offline event but did not get it");
      assert.ok(messagesCount['client_offline'] === 1, "expected [client_offline] event to be received only once");
      assert.ok(messagesCount['offline'] === 1, "expected [offline] event to be received only once");
      assert.ok(messagesCount['client_online'] == 2, "expected client_online event #2 but did not get it");
      assert.ok(messagesCount['online'] == 2, "expected online event #2 but did not get it");
      done();
    }, 2 * 1000);


    client2.presence('chat/1/participants').on(function(message) {
      logging.debug('Received message', message);
      var messageHash = message.op;
      if(!messagesCount[messageHash]) {
        messagesCount[messageHash] = 1;
      } else {
        messagesCount[messageHash] ++;
      }

    }).subscribe(function() {
        client1.presence('chat/1/participants').set('online');
        setTimeout(function() {
          client1.presence('chat/1/participants').set('offline');

          setTimeout(function() {
            client1.presence('chat/1/participants').set('online');

          }, 500);
        }, 500);
      });
  }

};

