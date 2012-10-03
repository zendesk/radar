var common = require('./common.js'),
    assert = require('assert'),
    http = require('http'),

    Radar = require('../server.js'),
    Persistence = require('../../core').Persistence,
    Client = require('radar_client').constructor,
    logging = require('minilog')('test');

http.globalAgent.maxSockets = 100;

exports['given a server and two connected clients'] = {

  beforeEach: function(done) {
    var self = this,
        tasks = 0;
    function next() { tasks++ && (tasks == 3) && done(); }
    common.startRadar(8000, this, function(){
      self.client = new Client().configure({ userId: 123, userType: 0, accountName: 'test', port: 8000})
                    .on('ready', next).alloc('test');
      self.client2 = new Client().configure({ userId: 123, userType: 0, accountName: 'test', port: 8000})
                    .on('ready', next).alloc('test');
    });
    Persistence.delWildCard('*:/test/*', next);
  },

  afterEach: function(done) {
    this.client.dealloc('test');
    this.client2.dealloc('test');
    common.endRadar(this, done);
  },

  after: function(done) {
    Persistence.disconnect(done);
  },

  'a presence can be set to online and subscribers will be updated': function(done) {
    var client = this.client, client2 = this.client2,
        notifications = [];
    // subscribe online with client 2
    // cache the notifications to client 2
    client2.presence('chat/1/participants').on(function(message){
      notifications.push(message);
    }).subscribe();
    // set client 1 to online
    client.presence('chat/1/participants').set('online', function() {
      client2.presence('chat/1/participants').get(function(message) {
        // both should show client 1 as online
        assert.equal('get', message.op);
        assert.deepEqual({ '123': 0 }, message.value);
        assert.deepEqual({ '123': 0 }, message.value);
        assert.equal(notifications.length, 1);
        assert.equal('online', notifications[0].op);
        assert.deepEqual({ '123': 0 }, notifications[0].value);
        done();
      });

    });
  },

  'calling fullSync multiple times does not alter the result if users remain connected': function(done) {
    this.timeout(35*1000);
    var client = this.client, client2 = this.client2,
        notifications = [], getCounter = 0;
    client2.presence('chat/1/participants').on(function(message){
      notifications.push(message);
    }).subscribe();
    // set client 1 to online
    client.presence('chat/1/participants').set('online', function() {

      var foo = setInterval(function() {
        client2.presence('chat/1/participants').get(function(message) {
          // both should show client 1 as online
          assert.equal('get', message.op)
          assert.deepEqual({ '123': 0 }, message.value)
          assert.equal(1, notifications.length)
          assert.equal('online', notifications[0].op)
          assert.deepEqual({ '123': 0 }, notifications[0].value);
          getCounter++;
        });
      }, 800);

      setTimeout(function() {
        clearInterval(foo);
        done();
      }, 32*1000)

    });

  },

  'a presence will not be set to offline during the grace period but will be offline after it': function(done) {

    var Minilog = require('minilog');
    Minilog.pipe(Minilog.backends.nodeConsole)
      .format(Minilog.backends.nodeConsole.formatWithStack);
    require('radar_client')._log
      .pipe(Minilog.backends.nodeConsole)
      .format(Minilog.backends.nodeConsole.formatWithStack);

    this.timeout(18*1000);
    var client = this.client, client2 = this.client2,
        notifications = [];
    // subscribe online with client 2
    // cache the notifications to client 2
    client2.presence('chat/1/participants').on(function(message){
//      logging.info('Receive message', message);
      notifications.push(message);
    }).subscribe();
    // set client 1 to online
    client.presence('chat/1/participants').set('online');
    // disconnect client 1l ensure that this happens later the online
    setTimeout(function() {
      client.dealloc('test');
      // do an explicit get as well after slightly less than the grace period
      setTimeout(function() {
        client2.presence('chat/1/participants').get(function(message) {
          logging.info('FOOOOO1', message, notifications);
          // both should show client 1 as online
          assert.equal('get', message.op)
          assert.deepEqual({ '123': 0 }, message.value)
            // we should have received one message only (online), no spurious notifications
          assert.equal(1, notifications.length);

          // a presence be set to offline after the grace period
          setTimeout(function() {
            client2.presence('chat/1/participants').get(function(message) {
              logging.info('FOOOOO2', message, notifications);
              // both should show client 1 as offline
              assert.equal('get', message.op)
              assert.deepEqual({}, message.value)
              assert.equal(2, notifications.length);
              done();
            });
          }, 3*1000);
        });
      }, 13*1000);
    }, 5);
  }

};

// if this module is the script being run, then run the tests:
if (module == require.main) {
  var mocha = require('child_process').spawn('mocha', [ '--bail', '--colors', '--ui', 'exports', '--reporter', 'spec', __filename ]);
  mocha.stdout.pipe(process.stdout);
  mocha.stderr.pipe(process.stderr);
}
