var common = require('./common.js'),
    assert = require('assert'),
    Client = require('../client/client.js'),
    Persistence = require('../core').Persistence,
    client, subscriptions;

describe('Client', function() {
  beforeEach(function(done) {
    common.startPersistence(done); // clean up
    client = new Client('joe', 1, 'test', 1);
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
    });

    describe('presences', function() {
      it('should store set operations', function(done) {
        var to = 'presence:/test/account/ticket/1',
            message = { to: to, op: 'set' };
        
        presences[to] = message;

        client.storeData(message);

        client.readData(function(state) {
          assert.deepEqual(state, {
            subscriptions: {},
            presences: presences
          });
          done();
        });
      });
    });
  });
});
