var assert = require('assert'),
    Status = require('../core/lib/resources/status.js'),
    Persistence = require('persistence'),
    Common = require('./common.js');

describe('given a status resource', function() {
  var status;
  var FakePersistence = {
    read: function() {},
    publish: function() {},
    expire: function() {},
  };
  var Radar = {
    broadcast: function() { }
  };

  before(function() {
    Status.setBackend(FakePersistence);
  });

  after(function() {
    Status.setBackend(Persistence);
  });

  beforeEach(function() {
    status = new Status('aaa', Radar, {});
    FakePersistence.readHashAll = function() {};
    FakePersistence.persistHash = function() {};
    FakePersistence.expire = function() {};
    FakePersistence.publish = function() {};
  });

  describe('get', function() {
    it('sends correct values to client', function(done) {
      FakePersistence.readHashAll = function(key, callback) {
        assert.equal('aaa', key);
        callback([1, 2]);
      };

      status.get({
        send: function(msg) {
          assert.equal('get', msg.op);
          assert.equal('aaa', msg.to);
          assert.deepEqual([1, 2], msg.value);
          done();
        }
      });
    });

    it('sends {} if not present', function(done) {
      FakePersistence.readHashAll = function(key, callback) {
        assert.equal('aaa', key);
        callback(null);
      };

      status.get({
        send: function(msg) {
          assert.equal('get', msg.op);
          assert.equal('aaa', msg.to);
          assert.deepEqual({}, msg.value);
          done();
        }
      });
    });
  });

  describe('set', function() {
    it('online', function() {
      var message = { key: 123, value: 'online' };
      var persisted, published;
      FakePersistence.persistHash = function(hash, key, value) {
        assert.equal('123', key);
        assert.equal('online', value);
        persisted = true;
      };
      FakePersistence.publish = function(key, value) {
        assert.equal('aaa', key);
        assert.deepEqual(message, value);
        published = true;
      };
      status.set({}, message);
      assert.ok(persisted);
      assert.ok(published);
    });

    it('offline', function() {
      var message = { key: 123, value: 'offline' };
      var persisted, published;
      FakePersistence.persistHash = function(hash, key, value) {
        assert.equal('123', key);
        assert.equal('offline', value);
        persisted = true;
      };
      FakePersistence.publish = function(key, value) {
        assert.equal('aaa', key);
        assert.deepEqual(message, value);
        published = true;
      };
      status.set({}, message);
      assert.ok(persisted);
      assert.ok(published);
    });

    it('renews expiry for maxPersistence', function() {
      var message = { key: 123, value: 'online' };
      var expired;
      FakePersistence.expire = function(hash, expiry) {
        assert.equal('aaa', hash);
        assert.equal(expiry, 12 * 60 * 60);
        expired = true;
      };
      status.set({}, message);
      assert.ok(expired);
    });
  });

  describe('sync', function() {
    it('responds with a get message', function(done) {
      FakePersistence.readHashAll = function(key, callback) {
        assert.equal('aaa', key);
        callback([1, 2]);
      };

      status.sync({
        id: 123,
        send: function(msg) {
          // Check message
          assert.equal('get', msg.op);
          assert.equal('aaa', msg.to);
          assert.deepEqual([1, 2], msg.value);
          done();
        }
      });
    });
    it('causes a subscription', function(done) {
      FakePersistence.readHashAll = function(key, callback) {
        assert.equal('aaa', key);
        callback([1, 2]);
      };

      status.sync({
        id: 123,
        send: function(msg) {
          assert.ok(status.subscribers['123']);
          done();
        }
      });
    });
  });

  describe('maxPersistence', function() {
    it('defaults to 12 hours', function(done) {
      assert.equal(status.options.policy.maxPersistence, 12 * 60 * 60);
      done();
    });

    it('can be overrided', function(done) {
      var options = {
        policy : {
          maxPersistence : 24 * 60 * 60,
        }
      };

      var status = new Status('aaa', Radar, options);
      assert.equal(status.options.policy.maxPersistence, 24 * 60 * 60);

      FakePersistence.expire = function(key, persistence) {
        assert.equal(24 * 60 * 60, persistence);
        done();
      };
      status.set({}, { key: 123, value: 'online' });
    });
  });
});

describe('a status resource', function() {
  describe('emitting messages', function() {
    beforeEach(function(done) {
      radarServer = Common.createRadarServer(done);
    });

    afterEach(function(done) {
      radarServer.terminate(done);
    });

    it('should emit incomming messages', function(done) {
      var subscribeMessage = { op: 'subscribe', to: 'status:/z1/test/ticket/1' };

      radarServer.on('resource:new', function(resource) {
        resource.on('message:incoming', function(message) {
          assert.equal(message.to, subscribeMessage.to);
          done()
        });
      });

      setTimeout(function() {
        radarServer._processMessage({}, subscribeMessage);
      }, 100);
    });

    it('should emit outgoing messages', function(done) {
      var subscribeMessage = { op: 'subscribe', to: 'status:/z1/test/ticket/1' },
          setMessage = { op: 'set', to: 'status:/z1/test/ticket/1', value: { 1: 2} },
          socketOne = { id: 1, send: function(m) { } },
          socketTwo = { id: 2, send: function(m) { } };

      radarServer.on('resource:new', function(resource) {
        resource.on('message:outgoing', function(message) {
          done();
        });
      });

      setTimeout(function() {
        radarServer._processMessage(socketOne, subscribeMessage);
        radarServer._processMessage(socketTwo, setMessage);
      }, 100);
    });
  });
});
