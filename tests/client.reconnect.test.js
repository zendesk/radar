var common = require('./common.js'),
    assert = require('assert'),
    Radar = require('../server/server.js'),
    logging = require('minilog')('test:reconnect'),
    Persistence = require('../core').Persistence,
    Client = require('radar_client').constructor,
    Tracker = require('callback_tracker'),
    radar;


exports['When server restarts, with existing clients,'] = {

  before: function(done) {
    var self = this,
        track = Tracker.create('beforeEach reconnect', done);

    radar = common.spawnRadar();
    radar.sendCommand('start', common.configuration, function() {
      self.client = common.getClient('test', 123, 0, { name: 'tester' }, track('client 1 ready'));
      self.client2 = common.getClient('test', 246, 0, { name: 'tester2' }, track('client 2 ready'));
    });
  },

  afterEach: function() {
    this.client.presence('restore').removeAllListeners();
    this.client.message('restore').removeAllListeners();
    this.client.status('restore').removeAllListeners();

    this.client.message('foo').removeAllListeners();

    this.client.dealloc('test');
    this.client2.dealloc('test');
  },

  after: function(done) {
    radar.sendCommand('stop', {}, function() {
      radar.kill();
      done();
    });
  },

  'should resubscribe to subscriptions' : function(done) {
    this.timeout(5000);
    var client = this.client,
        clientEvents = [];

    client.once('disconnected', function() { clientEvents.push('disconnected'); });
    client.once('connected', function() { clientEvents.push('connected'); });
    client.once('ready', function() { clientEvents.push('ready'); });

    var verifySubscriptions = function() {
      assert.deepEqual(clientEvents,['disconnected', 'connected', 'ready']);
      var tracker = Tracker.create('resources updated', done);

      client.message('restore').on(tracker('message updated', function(message) {
        assert.equal(message.to, 'message:/test/restore');
        assert.equal(message.op, 'publish');
        assert.equal(message.value, 'hello');
      })).publish('hello');

      client.status('restore').on(tracker('status updated', function(message) {
        assert.equal(message.to, 'status:/test/restore');
        assert.equal(message.op, 'set');
        assert.equal(message.value, 'hello');
      })).set('hello');

      client.presence('restore').on(tracker('presence updated', function(message) {
        assert.equal(message.to, 'presence:/test/restore');
        assert.equal(message.op, 'offline');
      })).set('offline');
    };

    var tracker = Tracker.create('subscriptions done', function() {
      common.restartRadar(radar, common.configuration, [client], verifySubscriptions);
    });
    client.message('restore').subscribe(tracker('message subscribed'));
    client.presence('restore').subscribe(tracker('presence subscribed'));
    client.status('restore').subscribe(tracker('status subscribed'));
  },

  'synced chat (messagelist) messages must not repeat, with two clients': function(done) {
    var client = this.client, client2 = this.client2, self = this, messages = [];
    this.timeout(5000);

    var verifySubscriptions = function() {
      assert.equal(messages.length, 2);
      assert.ok(messages.some(function(m) { return m.value == '1';}));
      assert.ok(messages.some(function(m) { return m.value == '2';}));
      done();
    };


    client.alloc('test', function() {
      client2.alloc('test', function() {
        client.message('foo').on(function(msg) {
          messages.push(msg);
          if(messages.length == 2) {
            //when we have enough, wait a while and check
            setTimeout(verifySubscriptions, 500);
          }
        }).sync();

        client2.message('foo').publish('1', function() {
          common.restartRadar(radar, common.configuration, [client, client2], function() {
            client.message('foo').publish('2');
          });
        });
      });
    });
  }

};
