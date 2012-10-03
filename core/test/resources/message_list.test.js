var assert = require('assert'),
    MessageList = require('../../lib/resources/message_list.js'),
    Persistence = require('../../lib/persistence.js');

var FakePersistence = {
  read: function() {},
  persist: function() {},
  publish: function() {}
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
/*
  'publish causes a broadcast and a write, if persistent': function(done) {
    var publishCalled = false, persistCalled = false;
    FakePersistence.publish = function(key, message) {
      assert.equal('hello world', message);
      publishCalled = true;
    };
    FakePersistence.persist = function() {
      persistCalled = true;
    };
    this.message.publish('hello world');
    assert.ok(publishCalled);
    assert.ok(persistCalled);
    done();
  },
*/
  'sync causes a read': function(done) {
    var message = this.message;
    FakePersistence.readOrderedWithScores = function(key, value, callback) {
      assert.equal('aaa', key);
      callback([1, 2]);
    };

    this.message.sync({
      id: 123,
      send: function(payload) {
        var msg = JSON.parse(payload);
        // check message
        assert.equal('sync', msg.op);
        assert.equal('aaa', msg.to);
        assert.deepEqual([1, 2], msg.value);
        done();
      }
    });
  }

};

// if this module is the script being run, then run the tests:
if (module == require.main) {
  var mocha = require('child_process').spawn('mocha', [ '--colors', '--ui', 'exports', '--reporter', 'spec', __filename ]);
  mocha.stdout.pipe(process.stdout);
  mocha.stderr.pipe(process.stderr);
}
