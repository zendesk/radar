var assert = require('assert'),
    MessageList = require('../core/lib/resources/message_list.js'),
    Persistence = require('../core/lib/persistence.js');

require('./common.js');

var FakePersistence = {
  read: function() {},
  persist: function() {},
  publish: function() {},
  expire: function() {}
};

var Radar = {
  broadcast: function() { }
};


exports['given a message list resource'] = {

  before: function() {
    MessageList.setBackend(FakePersistence);
  },

  after: function() {
    MessageList.setBackend(Persistence);
  },

  beforeEach: function() {
    this.message = new MessageList('aaa', Radar, {});
  },

  'publish causes a publish': function() {
    var publishCalled = false;
    FakePersistence.publish = function(key, message) {
      assert.equal('hello world', message);
      publishCalled = true;
    };

    this.message.publish('hello world');
    assert.ok(publishCalled);
  },

  'publish causes a broadcast and a write, if persistent': function() {
    var publishCalled = false, persistCalled = false;
    FakePersistence.publish = function(key, message) {
      assert.equal('hello world', message);
      publishCalled = true;
    };
    FakePersistence.persistOrdered = function() {
      persistCalled = true;
    };
    var message = new MessageList('aab', Radar, { policy : { cache : true } });
    message.publish('hello world');
    assert.ok(publishCalled);
    assert.ok(persistCalled);
  },

  'set expire to maxPersistence on a publish, if persistent': function() {
    var expiryTime;
    FakePersistence.expire = function(name, expiry) {
      expiryTime = expiry;
    };
    var message = new MessageList('aab', Radar, { policy : { cache : true, maxPersistence : 24 * 60 * 60 } });
    message.publish('hello world');
    assert.equal(expiryTime, 24 * 60 * 60);
  },

  'sync causes a read, and renews expiry': function(done) {
    var expiryTime;
    var message = new MessageList('aab', Radar, { policy : { cache : true, maxPersistence : 24 * 60 * 60 } });
    FakePersistence.readOrderedWithScores = function(key, value, callback) {
      assert.equal('aab', key);
      callback([1, 2]);
    };
    FakePersistence.expire = function(name, expiry) {
      expiryTime = expiry;
    };

    message.sync({
      id: 123,
      send: function(msg) {
        // check message
        assert.equal('sync', msg.op);
        assert.equal('aab', msg.to);
        assert.deepEqual([1, 2], msg.value);
        assert.equal(expiryTime, 24 * 60 * 60);
        done();
      }
    });
  },

  'sets a default option for maxPersistence': function() {
    var message = this.message;
    assert.equal(message.options.policy.maxPersistence, 14 * 24 * 60 * 60);
  }
};

// if this module is the script being run, then run the tests:
if (module == require.main) {
  var mocha = require('child_process').spawn('mocha', [ '--colors', '--ui', 'exports', '--reporter', 'spec', __filename ]);
  mocha.stdout.pipe(process.stdout);
  mocha.stderr.pipe(process.stderr);
}
