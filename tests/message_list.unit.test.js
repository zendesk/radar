var assert = require('assert'),
    MessageList = require('../core/lib/resources/message_list.js'),
    Persistence = require('persistence');

require('./common.js');




describe('For a message list', function() {
  var message_list;
  var Radar = {
    broadcast: function() { }
  };
  var FakePersistence = {
    read: function() {},
    persist: function() {},
    publish: function() {},
    expire: function() {}
  };

  before(function() {
    MessageList.setBackend(FakePersistence);
  });

  after(function() {
    MessageList.setBackend(Persistence);
  });

  beforeEach(function() {
    message_list = new MessageList('aaa', Radar, {});
    FakePersistence.publish = function() {};
    FakePersistence.readOrderedWithScores = function() {};
    FakePersistence.persistOrdered = function() {};
    FakePersistence.expire = function() {};
  });

  describe('publishing', function() {
    it('causes a publish to persistence', function() {
      var publishCalled = false;
      FakePersistence.publish = function(key, message) {
        assert.equal('hello world', message);
        publishCalled = true;
      };

      message_list.publish({}, 'hello world');
      assert.ok(publishCalled);
    });

    describe('if cache is set to true', function() {
      it('causes a broadcast and a write', function() {
        var publishCalled = false, persistCalled = false;
        FakePersistence.publish = function(key, message) {
          assert.equal('hello world', message);
          publishCalled = true;
        };
        FakePersistence.persistOrdered = function() {
          persistCalled = true;
        };
        var message_list = new MessageList('aab', Radar, { policy : { cache : true } });
        message_list.publish({}, 'hello world');
        assert.ok(publishCalled);
        assert.ok(persistCalled);
      });

      it('sets expiry if maxPersistence is provided', function() {
        var expiryTime;
        FakePersistence.expire = function(name, expiry) {
          expiryTime = expiry;
        };
        var message_list = new MessageList('aab', Radar, { policy : { cache : true, maxPersistence : 24 * 60 * 60 } });
        message_list.publish({}, 'hello world');
        assert.equal(expiryTime, 24 * 60 * 60);
      });

      it('sets expiry to default maxPersistence if none provided', function() {
        var expiryTime;
        FakePersistence.expire = function(name, expiry) {
          expiryTime = expiry;
        };
        var message_list = new MessageList('aab', Radar, { policy : { cache : true } });
        message_list.publish({}, 'hello world');
        assert.equal(expiryTime, 14 * 24 * 60 * 60);
      });
    });
  });

  describe('syncing', function() {
    it('causes a read', function(done) {
      var message_list = new MessageList('aab', Radar, { policy : { cache : true } });
      FakePersistence.readOrderedWithScores = function(key, value, callback) {
        assert.equal('aab', key);
        callback([1, 2]);
      };

      message_list.sync({
        send: function(msg) {
          // check message
          assert.equal('sync', msg.op);
          assert.equal('aab', msg.to);
          assert.deepEqual([1, 2], msg.value);
          done();
        }
      }, {});
    });

    it('renews expiry for maxPersistence', function(done) {
      var expiryTime;
      var message_list = new MessageList('aab', Radar, { policy : { cache : true, maxPersistence : 24 * 60 * 60 } });
      FakePersistence.readOrderedWithScores = function(key, value, callback) {
        assert.equal('aab', key);
        callback([1, 2]);
      };
      FakePersistence.expire = function(name, expiry) {
        expiryTime = expiry;
      };

      message_list.sync({
        send: function() {
          assert.equal(expiryTime, 24 * 60 * 60);
          done();
        }
      }, {});
    });
  });

  describe('unsubscribing', function() {
    it('renews expiry for maxPersistence', function(done) {
      var message_list = new MessageList('aab', Radar, { policy : { cache : true, maxPersistence : 24 * 60 * 60 } });
      message_list.parent = { destroyResource: function() {} };
      FakePersistence.expire = function(name, expiry) {
        assert.equal(expiry, 24 * 60 * 60);
        setTimeout(done,1);
      };

      message_list.unsubscribe({
        send: function() {}
      }, {});
    });
  });

  it('default maxPersistence is 14 days', function() {
    assert.equal(message_list.options.policy.maxPersistence, 14 * 24 * 60 * 60);
  });

  it('default caching is false', function() {
    assert.ok(!message_list.options.policy.cache);
  });
});
