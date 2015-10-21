var common = require('./common.js'),
    assert = require('assert'),
    Client = require('../client/client.js'),
    Persistence = require('../core').Persistence,
    client, subscriptions;

describe('Client', function() {
  beforeEach(function(done) {
    common.startPersistence(done); // clean up
    client = new Client('joe', Math.random(), 'test', 1);
    subscriptions = {};
    presences = {};
  });

  describe('.storeData and .loadData', function() {
    describe('subscriptions', function() {
      it('should store subscribe operations', function(done) {
        var to = 'presence:/test/account/ticket/1',
            message = { to: to, op: 'subscribe' };
        
        subscriptions[to] = message;

        client.storeData(message);

        client.readData(function(state) {
          assert.deepEqual(state, {
            subscriptions: subscriptions,
            presences: {}
          });
          done();
        });
      });

      it('should store sync as subscribes', function(done) {
        var to = 'presence:/test/account/ticket/1',
            message = { to: to, op: 'sync' };
        
        subscriptions[to] = message;

        client.storeData(message);

        client.readData(function(state) {
          assert.deepEqual(state, {
            subscriptions: subscriptions,
            presences: {}
          });
          done();
        });
      });

      it('should remove subscriptions on unsubscribe', function(done) {
        var to = 'presence:/test/account/ticket/1',
            subscribe = { to: to, op: 'subscribe' },
            unsubscribe = { to: to, op: 'unsubscribe' };
        
        client.storeData(subscribe);
        client.storeData(unsubscribe);

        client.readData(function(state) {
          assert.deepEqual(state, {
            subscriptions: {},
            presences: {}
          });
          done();
        });
      });

      it('sync after subscribe, keeps the sync', function(done) {
        var to = 'presence:/test/account/ticket/1',
            subscribe = { to: to, op: 'subscribe' },
            sync = { to: to, op: 'sync' };
        
        client.storeData(subscribe);
        client.storeData(sync);

        subscriptions[to] = sync;

        client.readData(function(state) {
          assert.deepEqual(state, {
            subscriptions: subscriptions,
            presences: {}
          });
          done();
        });
      });

      it('subscribe after sync, keeps the sync', function(done) {
        var to = 'presence:/test/account/ticket/1',
            subscribe = { to: to, op: 'subscribe' },
            sync = { to: to, op: 'sync' };
        
        client.storeData(sync);
        client.storeData(subscribe);

        subscriptions[to] = sync;

        client.readData(function(state) {
          assert.deepEqual(state, {
            subscriptions: subscriptions,
            presences: {}
          });
          done();
        });
      });
    });

    describe('presences', function() {
      it('should store set online operations', function(done) {
        var to = 'presence:/test/account/ticket/1',
            message = { to: to, op: 'set', value: 'online' };
        
        client.storeData(message);

        delete message.value;
        presences[to] = message;

        client.readData(function(state) {
          assert.deepEqual(state, {
            subscriptions: {},
            presences: presences
          });
          done();
        });
      });

      it('should remove presence when set offline', function(done) {
        var to = 'presence:/test/account/ticket/1',
            online = { to: to, op: 'set', value: 'online' },
            offline = { to: to, op: 'set', value: 'offline' };
        
        client.storeData(online);
        client.storeData(offline);

        client.readData(function(state) {
          assert.deepEqual(state, {
            subscriptions: {},
            presences: {}
          });
          done();
        });
      });
    });
  });
});
