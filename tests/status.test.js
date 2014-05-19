var assert = require('assert'),
    Status = require('../index.js').core.Status,
    Persistence = require('persistence');

require('./common.js');

var FakePersistence = {
  read: function() {},
  publish: function() {},
  expire: function() {}
};

var Radar = {
  broadcast: function() { }
};


exports['given a status resource'] = {

  before: function() {
    Status.setBackend(FakePersistence);
  },

  after: function() {
    Status.setBackend(Persistence);
  },

  beforeEach: function() {
    this.status = new Status('aaa', Radar, {});
    FakePersistence.readHashAll = function() {};
    FakePersistence.persistHash = function() {};
    FakePersistence.expire = function() {};
  },

  'can get the current status': function(done) {

    FakePersistence.readHashAll = function(key, callback) {
      assert.equal('aaa', key);
      callback([1, 2]);
    };

    this.status.get({
      send: function(msg) {
        assert.equal('get', msg.op);
        assert.equal('aaa', msg.to);
        assert.deepEqual([1, 2], msg.value);
        done();
      }
    });
  },

  'changes the status to an empty object if the result is null': function(done) {

    FakePersistence.readHashAll = function(key, callback) {
      assert.equal('aaa', key);
      callback(null);
    };

    this.status.get({
      send: function(msg) {
        assert.equal('get', msg.op);
        assert.equal('aaa', msg.to);
        assert.deepEqual({}, msg.value);
        done();
      }
    });
  },

  'can set status to online': function(done) {
    FakePersistence.persistHash = function(hash, key, value) {
      assert.equal('123', key);
      assert.equal('online', value);
      done();
    };
    this.status.set({}, { key: 123, value: 'online' });
  },

  'can set status to offline': function(done) {
    FakePersistence.persistHash = function(hash, key, value) {
      assert.equal('123', key);
      assert.equal('offline', value);
      done();
    };
    this.status.set({}, { key: 123, value: 'offline' });
  },

  'sync causes a read and a subscription': function(done) {
    var status = this.status;
    FakePersistence.readHashAll = function(key, callback) {
      assert.equal('aaa', key);
      callback([1, 2]);
    };

    status.sync({
      id: 123,
      send: function(msg) {
        // check subscription
        assert.ok(status.subscribers['123']);
        // check message
        assert.equal('get', msg.op);
        assert.equal('aaa', msg.to);
        assert.deepEqual([1, 2], msg.value);
        done();
      }
    });
  },

  'subscribe adds a subscriber and unsubscribe causes a unsubscribe if this is the last client': function(done) {
    var status = this.status;

    Radar.destroy = function(name) {
      assert.equal('aaa', name);
      done();
    };

    status.subscribe(123);
    status.unsubscribe(123);
  },

  'sets a default option for maxPersistence': function(done) {
    var status = this.status;
    assert.equal(status.options.policy.maxPersistence, 12 * 60 * 60);
    done();
  },

  'provided option overrides default': function(done) {
    var options = {
      policy : {
        maxPersistence : 24 * 60 * 60,
        cache : true,
        another : false
      },
      base : 'string here'
    };

    var status = new Status('aaa', Radar, options);
    assert.equal(status.options.policy.maxPersistence, 24 * 60 * 60);
    assert.equal(status.options.policy.cache, true);
    assert.equal(status.options.policy.another, false);
    assert.equal(status.options.base, 'string here');

    FakePersistence.expire = function(key, persistence) {
      assert.equal(24 * 60 * 60, persistence);
      done();
    };
    status.set({}, { key: 123, value: 'online' });
  }
};
