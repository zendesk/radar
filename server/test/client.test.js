var common = require('./common.js'),
    assert = require('assert'),

    Radar = require('../server.js'),
    Persistence = require('../../core').Persistence,
    Client = require('radar_client').constructor;

exports['given a server'] = {

  before: function(done) {
    var Minilog = require('minilog');
    require('radar_client')._log
      .pipe(Minilog.backends.nodeConsole)
      .filter(Minilog.backends.nodeConsole.filterEnv((process.env.radar_log ? process.env.radar_log : '*')))
      .format(Minilog.backends.nodeConsole.formatWithStack);

    common.startRadar(8002, this, done);
  },

  after: function(done) { common.endRadar(this, function() { Persistence.disconnect(done); }); },

  beforeEach: function(done) {
    var tasks = 0;
    function next() { tasks++ && (tasks == 2) && done(); }
    this.client = new Client()
      .configure({ userId: 123, userType: 0, accountName: 'dev', port: 8002})
      .alloc('test', next);
    Persistence.delWildCard('*:/dev/*', next);
  },

// Presence tests
// - .get(callback)
// - .set('online', ack) / .set('offline', ack)
// - .subscribe(ack)
// - .unsubscribe(ack)
// - .sync(callback)

  'presence: can set("online")': function(done) {
    Radar.once('set', function(client, message) {
      assert.equal('set', message.op)
      assert.equal('online', message.value)
      assert.equal(123, message.key);
      done();
    });
    this.client.presence('ticket/21').set('online');
  },

  'presence: can set("offline")': function(done) {
    Radar.once('set', function(client, message) {
      assert.equal('set', message.op);
      assert.equal('offline', message.value);
      assert.equal(123, message.key);
      done();
    });
    this.client.presence('ticket/21').set('offline');
  },

  'presence: can get()': function(done) {
    var client = this.client;
    client.presence('ticket/21').get(function(message) {
      assert.equal('get', message.op);
      assert.deepEqual([], message.value);
      client.presence('ticket/21').set('online', function() {
        client.presence('ticket/21').get(function(message) {
          assert.equal('get', message.op);
          assert.deepEqual({ '123': 0 }, message.value);
          done();
        });
      });
    });
  },

/*

  This does not work right now, as the result from .get and .sync use different op codes.
  Need to ensure that chat and other presence-based functionality is not expecting "online" op before changing.

  'presence: can sync()': function(done) {
    var client = this.client;

    this.client.presence('ticket/213').set('online', function() {
      client.presence('ticket/213').sync(function(message) {
        // sync is implemented as subscribe + get, hence the return op is "get"
        assert.equal('get', message.op);
        assert.equal(JSON.stringify({ 123: 'foo'}), JSON.stringify(message.value));
        done();
      });
    });
  },
*/

// Status tests
// - .set(value, ack)
// - .get(callback)
// - .subscribe(ack)
// - .unsubscribe(ack)
// - .sync(callback)

  'status: can set(value)': function(done) {
    Radar.once('set', function(client, message) {
      assert.equal('set', message.op);
      assert.equal('foo', message.value);
      assert.equal(123, message.key);
      done();
    });
    this.client.status('voice/status').set('foo');
  },

  'status: can set(JSON object)': function(done) {
    var client = this.client;
    Radar.once('set', function(ignore, message) {
      assert.equal('set', message.op);
      assert.deepEqual({ hello: "world" }, JSON.parse(message.value));
      assert.equal(123, message.key);
      client.status('voice/status').get(function(message) {
        assert.equal('get', message.op);
        assert.deepEqual( { hello: "world" }, JSON.parse(message.value['123']));
        done();
      });
    });
    this.client.status('voice/status').set(JSON.stringify({ hello: "world" }));
  },

  'status: can get()': function(done) {
    var client = this.client;

    this.client.status('voice/status').set('foo');

    client.status('voice/status').get(function(message) {
      assert.equal('get', message.op);
      assert.deepEqual({ 123: 'foo'}, message.value);
      client.status('voice/status').set('bar');
      client.status('voice/status').get(function(message) {
        assert.equal('get', message.op);
        assert.equal(JSON.stringify({ 123: 'bar'}), JSON.stringify(message.value));
        done();
      });
    });
  },

  'status: can subscribe()': function(done) {
    var client = this.client;
    var client2 = new Client()
      .configure({ userId: 234, userType: 0, accountName: 'dev', port: 8002})
      .alloc('test', function() {
        client2.status('voice/status')
          .once(function(message) {
            assert.equal('set', message.op);
            assert.equal('foo', message.value);
            assert.equal('123', message.key);
            done();
          })
          .subscribe(function() {
            client.status('voice/status').set('foo');
          });
      });
  },

  'status: can sync()': function(done) {
    var client = this.client;

    this.client.status('voice/status').set('foo', function(ack) {
      client.status('voice/status').sync(function(message) {
        // sync is implemented as subscribe + get, hence the return op is "get"
        assert.equal('get', message.op);
        assert.equal(JSON.stringify({ 123: 'foo'}), JSON.stringify(message.value));
        done();
      });
    });
  },

// Message list tests
// - .subscribe('channel')
// - .unsubscribe('channel')
// - .sync('channel')
// - .publish('channel', message)

  'message: can subscribe()': function(done) {
    var client = this.client;
    // test.expect(2);
    Radar.when('subscribe', function(client, msg) {
      var match = (msg.op == 'subscribe' && msg.to == 'message:/dev/test');
      if (match) {
        assert.equal('subscribe', msg.op);
        assert.equal('message:/dev/test', msg.to);
        done();
      }
      return match;
    });
    // optional (due to new "connect-if-configured-logic"): client.alloc('test');
    client.message.subscribe('test');
  },

  'message: can publish()': function(done) {
    var client = this.client;
    // test.expect(2);
    var message = { state: 'other'};

    client.message.when('test', function(msg) {
      if(msg.value && msg.value.state && msg.value.state == 'other') {
        assert.equal('message:/dev/test', msg.to);
        assert.equal('other', msg.value.state);
        done();
        return true;
      }
      return false;
    });
    client.message.subscribe('test');
    client.message.publish('test', message);
  },

  'message: can sync()': function(done) {
    var client = this.client,
        message = { foo: 'bar' },
        assertions = 0;
    Persistence.persistOrdered('message:/dev/test', JSON.stringify(message), function() {
      client.message.on('test', function(msg) {
        assert.equal('bar', msg.foo);
        assertions++;
      }).sync('test');
      setTimeout(function() {
        assert.equal(1, assertions);
        done();
      }, 50);
    });
  }
};

// if this module is the script being run, then run the tests:
if (module == require.main) {
  var mocha = require('child_process').spawn('mocha', [ '--colors', '--ui', 'exports', '--reporter', 'spec', __filename ]);
  mocha.stdout.pipe(process.stdout);
  mocha.stderr.pipe(process.stderr);
}
