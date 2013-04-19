var assert = require('assert'),
    MessageList = require('../../lib/resources/message_list.js'),
    Persistence = require('../../lib/persistence.js');

var FakePersistence = {
  read: function() {},
  persist: function() {},
  publish: function() {},
  expire: function() {}
};

var Radar = {
  broadcast: function(subscribers, message) { }
};


exports['given a message list resource'] = {

  before: function(done) {
    MessageList.setBackend(FakePersistence);
    done();
  },

  after: function(done) {
    MessageList.setBackend(Persistence);
    done();
  },

  beforeEach: function(done) {
    this.message = new MessageList('aaa', Radar, {});
    done();
  },

  'publish causes a publish': function(done) {
    var publishCalled = false;
    FakePersistence.publish = function(key, message) {
      assert.equal(JSON.stringify('hello world'), message);
      publishCalled = true;
    };

    this.message.publish('hello world');
    assert.ok(publishCalled);
    done();
  },

  'publish causes a broadcast and a write, if persistent': function(done) {
    var publishCalled = false, persistCalled = false;
    FakePersistence.publish = function(key, message) {
      assert.equal(JSON.stringify('hello world'), message);
      publishCalled = true;
    };
    FakePersistence.persistOrdered = function() {
      persistCalled = true;
    };
    var message = new MessageList('aab', Radar, { policy : { cache : true } })
    message.publish('hello world');
    assert.ok(publishCalled);
    assert.ok(persistCalled);
    done();
  },

  'set expire to maxPersistence on a publish, if persistent': function(done) {
    var expiryTime;
    FakePersistence.expire = function(name, expiry) {
      expiryTime = expiry;
    };
    var message = new MessageList('aab', Radar, { policy : { cache : true, maxPersistence : 24 * 60 * 60 } })
    message.publish('hello world');
    assert.equal(expiryTime, 24 * 60 * 60);
    done();
  },

  'sync causes a read, and renews expiry': function(done) {
    var expiryTime;
    var message = new MessageList('aab', Radar, { policy : { cache : true, maxPersistence : 24 * 60 * 60 } })
    FakePersistence.readOrderedWithScores = function(key, value, callback) {
      assert.equal('aab', key);
      callback([1, 2]);
    };
    FakePersistence.expire = function(name, expiry) {
      expiryTime = expiry;
    };

    message.sync({
      id: 123,
      send: function(payload) {
        var msg = JSON.parse(payload);
        // check message
        assert.equal('sync', msg.op);
        assert.equal('aab', msg.to);
        assert.deepEqual([1, 2], msg.value);
        assert.equal(expiryTime, 24 * 60 * 60);
        done();
      }
    });
  },

  'sets a default option for maxPersistence': function(done) {
    var message = this.message;
    assert.equal(message.options.policy.maxPersistence, 14 * 24 * 60 * 60);
    done();
  },
};

// if this module is the script being run, then run the tests:
if (module == require.main) {
  var mocha = require('child_process').spawn('mocha', [ '--colors', '--ui', 'exports', '--reporter', 'spec', __filename ]);
  mocha.stdout.pipe(process.stdout);
  mocha.stderr.pipe(process.stderr);
}
