var common = require('./common.js'),
    assert = require('assert'),
    http = require('http'),
    verbose = false,
    Persistence = require('../core').Persistence,
    Client = require('radar_client').constructor,
    logging = require('minilog')('test'),
    client, client2;

http.globalAgent.maxSockets = 10000;

if (verbose) {
var Minilog = require('minilog');
Minilog.pipe(Minilog.backends.nodeConsole)
  .format(Minilog.backends.nodeConsole.formatWithStack);
}

exports['presence: given a server and two connected clients'] = {

  beforeEach: function(done) {
    var tasks = 0;
    function next() {
      tasks++;
      if (tasks == 3) {
        done();
      }
    }
    common.startRadar(8000, this, function(){
      client = new Client().configure({
        userId: 123,
        userType: 0,
        accountName: 'test',
        port: 8000,
        upgrade: false,
        userData: { name: 'tester' }
      }).on('ready', next).alloc('test');

      client2 = new Client().configure({
        userId: 222,
        userType: 0,
        accountName: 'test',
        port: 8000,
        upgrade: false,
        userData: { name: 'tester2' }
      }).on('ready', next).alloc('test');
    });
    Persistence.delWildCard('*:/test/*', next);
  },

  afterEach: function(done) {
    client.dealloc('test');
    client2.dealloc('test');
    common.endRadar(this, done);
  },

  'a presence can be set to online and subscribers will be updated': function(done) {
    var notifications = [];
    // subscribe online with client 2
    // cache the notifications to client 2
    client2.presence('chat/1/participants').on(function(message){
      notifications.push(message);
    }).subscribe(function() {
      // set client 1 to online
      client.presence('chat/1/participants').set('online', function() {
        client2.presence('chat/1/participants').get(function(message) {
          // both should show client 1 as online
          assert.equal('get', message.op);
          assert.deepEqual({ '123': 0 }, message.value);

          assert.equal(notifications.length, 2);
          assert.equal(notifications[0].op, 'online');
          assert.deepEqual(notifications[0].value, { '123': 0 });
          assert.equal(notifications[1].op, 'client_online');
          assert.equal(notifications[1].value.userId, 123);
          assert.equal(notifications[1].value.clientId, client._socket.id);
          done();
        });
      });
    });
  },

  'userData will persist when a presence is updated': function(done) {
    this.timeout(40*1000);
    var scope = 'chat/1/participants';

    client.presence(scope).set('online', function() {
      var presence = client2.presence(scope).sync({version: 2}, function sync(message) {
        assert.equal(message.op, 'get');
        assert.deepEqual(message.to, 'presence:/test/' + scope);
        assert.equal(message.value['123'].userType, 0);
        assert.deepEqual(message.value['123'].clients[client.currentClientId()], { name: 'tester' });

        setTimeout(function() {
          presence.get({version:2}, function(message) {
            sync(message);
            done();
          });
        }, 30000);
      });
    });
  },

  'calling fullSync multiple times does not alter the result if users remain connected': function(done) {
    this.timeout(35*1000);
    var notifications = [], getCounter = 0;
    client2.presence('chat/1/participants').on(function(message){
      notifications.push(message);
    }).subscribe(function() {
      // set client 1 to online
      client.presence('chat/1/participants').set('online', function() {

        var foo = setInterval(function() {
          client2.presence('chat/1/participants').get(function(message) {
            // both should show client 1 as online
            assert.equal('get', message.op)
            assert.deepEqual({ '123': 0 }, message.value)

            assert.equal(notifications.length, 2);
            assert.equal(notifications[0].op, 'online');
            assert.deepEqual(notifications[0].value, { '123': 0 });
            assert.equal(notifications[1].op, 'client_online');
            assert.equal(notifications[1].value.userId, 123);
            assert.equal(notifications[1].value.clientId, client._socket.id);
            getCounter++;
          });
        }, 800);

        setTimeout(function() {
          clearInterval(foo);
          done();
        }, 32*1000);
      });
    });
  },

  'a presence will not be set to offline during the grace period but will be offline after it': function(done) {
    enabled = true;
    this.timeout(18*1000);
    var notifications = [];
    // subscribe online with client 2
    // cache the notifications to client 2
    client2.presence('chat/1/participants').on(function(message){
      logging.info('Receive message', message);
      notifications.push(message);
    }).subscribe(function() {
      // set client 1 to online
      client.presence('chat/1/participants').set('online');
      // disconnect client 1 - ensure that this happens later the online
      setTimeout(function() {
        client.dealloc('test');
        client.manager.close();
        // do an explicit get as well after slightly less than the grace period
        setTimeout(function() {
          client2.presence('chat/1/participants').get(function(message) {
            logging.info('FOOOOO1', message, notifications);
            // both should show client 1 as online
            assert.equal('get', message.op);
            assert.deepEqual({ '123': 0 }, message.value);

            // we should have received a online notification
            assert.ok(notifications.some(function(m) { return m.op == 'online'}));
            // This does not hold now that we have client_online/client_offline notifications: assert.equal(1, notifications.length);

            // a presence be set to offline after the grace period
            setTimeout(function() {
              client2.presence('chat/1/participants').get(function(message) {
                logging.info('FOOOOO2', message, notifications);
                // both should show client 1 as offline
                assert.equal(message.op, 'get');
                assert.deepEqual(message.value, {});

                assert.ok(notifications.some(function(m) { return m.op == 'offline'}));
                // broken due to new notifications: assert.equal(2, notifications.length);
                done();
              });
            }, 3*1000);
          });
        }, 13*1000);
      }, 5);
    });
  }

};

