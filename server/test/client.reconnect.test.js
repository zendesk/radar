var common = require('./common.js'),
    assert = require('assert'),

    Radar = require('../server.js'),
    Persistence = require('../../core').Persistence,
    Client = require('radar_client').constructor;

exports['given a server and two connected clients'] = {

/*
  before: function(done) {
    var Minilog = require('minilog');
    require('radar_client')._log
      .pipe(Minilog.backends.nodeConsole)
      .format(Minilog.backends.nodeConsole.formatWithStack);
    done();
  },
*/

  beforeEach: function(done) {
    var self = this,
        tasks = 0;
    function next() { tasks++ && (tasks == 3) && done(); }
    common.startRadar(8009, this, function(){
      self.client = new Client().configure({ userId: 123, userType: 0, accountName: 'test', port: 8009}).once('ready', next).alloc('test');
      self.client2 = new Client().configure({ userId: 246, userType: 2, accountName: 'test', port: 8009}).once('ready', next).alloc('test');
    });
    Persistence.delWildCard('*:/test/*', next);
  },

  afterEach: function(done) {
    this.client.dealloc('test');
    this.client2.dealloc('test');
    common.endRadar(this, function() { Persistence.disconnect(done); });
  },
/*
  'restoring a message list after reconnect works': function(done) {
    var client = this.client, client2 = this.client2,
        notifications = [];

    client.message.on('test/restore', function(message) {
      notifications.push(message);
    });
    client.message.sync('test/restore');

    setTimeout(function() {
//      client.manager.socket.setOffline();
    }, 1000);
    done();
  },
  */

  'restarting the server will not cause duplicate messages': function(done) {
    var client = this.client, client2 = this.client2, self = this, messages = [];
    this.timeout(30000);

    client.message('foo').on(function(msg) {
      messages.push(msg);
    }).sync();

    client2.message('foo').publish('1');

    setTimeout(function() {
      common.endRadar(self, function() {
        client2.message('foo').publish('2');
        common.startRadar(8009, self, function(){
          client2.message('foo').publish('3');
          setTimeout(function() {
            assert.equal(messages.length, 3);
            assert.ok(messages.some(function(m) { return m.value == '1';}));
            assert.ok(messages.some(function(m) { return m.value == '2';}));
            assert.ok(messages.some(function(m) { return m.value == '3';}));
            done();
          }, 5000); // need wait here since reconnect is 2sec
        });
      });
    }, 500); // allow time for messages to be delivered
  },
/*

  'restoring a presence after reconnect works': function(done) {
    done();
  },

  'presence is restored even after the server has expired the previous set(online)': function(done) {
    done();
  },

  'restoring a status after reconnect works': function(done) {
    done();
  }
*/

};

// if this module is the script being run, then run the tests:
if (module == require.main) {
  var mocha = require('child_process').spawn('mocha', [ '--bail', '--colors', '--ui', 'exports', '--reporter', 'spec', __filename ]);
  mocha.stdout.pipe(process.stdout);
  mocha.stderr.pipe(process.stderr);
}
