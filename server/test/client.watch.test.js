var common = require('./common.js'),
    assert = require('assert'),

    Radar = require('../server.js'),
    Persistence = require('../../core').Persistence,
    Client = require('radar_client').constructor;

exports['given two clients'] = {
  before: function(done) { common.startRadar(8001, this, done); },

  after: function(done) { common.endRadar(this, function() { Persistence.disconnect(done); }); },

  beforeEach: function(done) {
    var tasks = 0;
    function next() { tasks++ && (tasks == 4) && done(); }
    this.client = new Client().configure({ userId: 123, userType: 0, accountName: 'dev', port: 8001 })
                  .once('ready', next).alloc('test');
    this.client2 = new Client().configure({ userId: 246, userType: 0, accountName: 'dev', port: 8001 })
                  .once('ready', next).alloc('test');
    Persistence.del('presence:/dev/ticket/21', next);
    Persistence.del('status:/dev/voice/status', next);
  },

  'can subscribe a presence scope': function(done) {
    var client = this.client, client2 = this.client2;
    client.presence('ticket/21').subscribe(function() {
      client.once('presence:/dev/ticket/21', function(message) {
        assert.equal('online', message.op);
        assert.deepEqual({ '246': 0 }, message.value);
        client2.presence('ticket/21').set('offline');
        client.once('presence:/dev/ticket/21', function(message) {
          assert.equal('offline', message.op);
          assert.deepEqual({ '246': 0 }, message.value);
          done();
        });
      });
      client2.presence('ticket/21').set('online');
    });
  },

  'can unsubscribe a presence scope': function(done) {
    var client = this.client, client2 = this.client2;
    client.presence('ticket/21').subscribe(function() {
      client.once('presence:/dev/ticket/21', function(message) {
        assert.equal('online', message.op);
        assert.deepEqual({ '246': 0 }, message.value);
        client.presence('ticket/21').unsubscribe(function() {
          client.once('presence:/dev/ticket/21', function(message) {
            assert.ok(false); // should not receive message
          });
          client2.presence('ticket/21').set('offline');
          setTimeout(function() {
            done();
          }, 10);
        });
      });
      client2.presence('ticket/21').set('online');
    });
  },

  'can subscribe a status scope': function(done) {
    var client = this.client, client2 = this.client2;
    client.status('voice/status').subscribe(function() {
      client.once('status:/dev/voice/status', function(message) {
        assert.equal('246', message.key);
        assert.equal('foo', message.value);
        client.once('status:/dev/voice/status', function(message) {
          assert.equal('246', message.key);
          assert.equal('bar', message.value);
          done();
        });
        client2.status('voice/status').set('bar');
      });
      client2.status('voice/status').set('foo');
    });
  },

  'can subscribe a status scope with chainable interface': function(done) {
    var client = this.client, client2 = this.client2;
    client.status('voice/status').subscribe(function() {
      client2.status('voice/status').set('foo');
    }).once(function(message) {
      assert.equal('246', message.key);
      assert.equal('foo', message.value);
      client.once('status:/dev/voice/status', function(message) {
        assert.equal('246', message.key);
        assert.equal('bar', message.value);
        done();
      });
      client2.status('voice/status').set('bar');
    });
  },

  'can unsubscribe a status scope': function(done) {
    var client = this.client, client2 = this.client2;
    client.status('voice/status').subscribe(function() {
      client.once('status:/dev/voice/status', function(message) {
        assert.equal('246', message.key);
        assert.equal('foo', message.value);
        client.status('voice/status').unsubscribe(function() {
          client.once('presence:/dev/voice/status', function(message) {
            assert.ok(false); // should not receive message
          });
          client2.status('voice/status').set('bar');
          setTimeout(function() {
            done();
          }, 10);
        });
      });
      client2.status('voice/status').set('foo');
    });
  }
};

// if this module is the script being run, then run the tests:
if (module == require.main) {
  var mocha = require('child_process').spawn('mocha', [ '--colors', '--ui', 'exports', '--reporter', 'spec', __filename ]);
  mocha.stdout.pipe(process.stdout);
  mocha.stderr.pipe(process.stderr);
}
