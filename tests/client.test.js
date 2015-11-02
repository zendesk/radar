var common = require('./common.js'),
    assert = require('assert'),
    Client = require('../client/client.js'),
    Persistence = require('../core').Persistence,
    Request = require('radar_message').Request,
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
            message = { to: to, op: 'subscribe' },
            request_sub = new Request(message);
        
        subscriptions[to] = message;

        client.storeData(request_sub);

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
            message = { to: to, op: 'sync' },
            request_sync = new Request(message);
        
        subscriptions[to] = message;

        client.storeData(request_sync);

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
            unsubscribe = { to: to, op: 'unsubscribe' },
            request_sub = new Request(subscribe),
            request_unsub = new Request(unsubscribe);
        
        client.storeData(request_sub);
        client.storeData(request_unsub);

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
            sync = { to: to, op: 'sync' },
            request_sub = new Request(subscribe), 
            request_sync = new Request(sync); 

        client.storeData(request_sub);
        client.storeData(request_sync);

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
            sync = { to: to, op: 'sync' },
            request_sub = new Request(subscribe), 
            request_sync = new Request(sync); 
        
        client.storeData(request_sub);
        client.storeData(request_sync);

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
            message = { to: to, op: 'set', value: 'online' },
            request_set = new Request(message);

        client.storeData(request_set);

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
            offline = { to: to, op: 'set', value: 'offline' },
            request_online = new Request(online), 
            request_offline = new Request(offline); 

        client.storeData(request_online);
        client.storeData(request_offline);

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
