var common = require('./common.js'),
    assert = require('assert'),
    logging = require('minilog')('test'),
    Persistence = require('../core').Persistence,
    Tracker = require('callback_tracker'),
    Client = require('radar_client').constructor,
    radar, client, client2;

exports['given two clients'] = {
  before: function(done) {
    radar = common.spawnRadar();
    radar.sendCommand('start', common.configuration, done);
  },

  after: function(done) {
    radar.sendCommand('stop', {}, function() {
      radar.kill();
      done();
    });
  },

  beforeEach: function(done) {
    var track = Tracker.create('beforeEach', done);
    client = common.getClient('dev', 123, 0, { name: 'tester' }, track('client 1 ready'));
    client2 = common.getClient('dev', 246, 0, { name: 'tester2' }, track('client 2 ready'));
  },

  afterEach: function() {
    client.presence('test').removeAllListeners();
    client2.presence('test').removeAllListeners();
    client.presence('test').set('offline');
    client2.presence('test').set('offline');
    client.dealloc('test');
    client2.dealloc('test');
  },

  'can subscribe a presence scope': function(done) {
    var messages = [];

    client.presence('test')
    .on(function(m) {
      messages.push(m);
    }).subscribe(function() {
      client2.presence('test').set('online', function() {
        client2.presence('test').set('offline', function() {
          // ensure that async tasks have run
          setTimeout(function() {
            assert.equal('online', messages[0].op);
            assert.deepEqual({ '246': 0 }, messages[0].value);
            assert.equal('client_online', messages[1].op);
            assert.deepEqual(messages[1].value.userId, 246);
            assert.equal('client_offline', messages[2].op);
            assert.deepEqual(messages[2].value.userId, 246);
            assert.equal('offline', messages[3].op);
            assert.deepEqual({ '246': 0 }, messages[3].value);
            done();
          }, 5);
        });
      });
    });
  },


  'can unsubscribe a presence scope': function(done) {
    client.presence('test').subscribe(function() {
      client.once('presence:/dev/test', function(message) {
        assert.equal('online', message.op);
        assert.deepEqual({ '246': 0 }, message.value);
        client.presence('test').unsubscribe(function() {
          client.once('presence:/dev/test', function() {
            assert.ok(false); // should not receive message
          });
          client2.presence('test').set('offline');
          setTimeout(function() {
            done();
          }, 10);
        });
      });
      client2.presence('test').set('online');
    });
  },

  'should send presence messages correctly when toggling back and forth': function(done) {
    var messages = { count: 0 };
    var count = 9; //FIXME: only odd number works
    var onlines = Math.ceil(count/2);
    var offlines = Math.floor(count/2);

    var verify = function() {
      logging.info(messages);
      assert.ok(messages.client_offline == offlines, "expected "+ offlines +" but got " + messages.client_offline + " client_offlines");
      assert.ok(messages.offline == offlines, "expected " + offlines + " but got " + messages.offline + " offlines");
      assert.ok(messages.client_online == onlines, "expected "+ onlines +" but got " + messages.client_online + " client_onlines");
      assert.ok(messages.online == onlines, "expected "+ onlines +" but got " + messages.online + " onlines");
      done();
    };

    var current_state = 'offline';
    var toggle = function() {
      current_state = (current_state == 'offline'?'online':'offline');
      logging.info("setting "+current_state);
      client.presence('test').set(current_state);
    };

    client2.presence('test').on(function(message){
      logging.info('Received message', message);
      if(!messages[message.op]) {
        messages[message.op] = 1;
      } else {
        messages[message.op] ++;
      }
      messages.count ++;
      //Got everything, wait if we get something unwanted
      if(messages.count == 2*count) {
        setTimeout(verify, 50);
      }
    }).subscribe(function() {
    logging.info("=================");
      for(var i = 0; i< count; i++) {
        setTimeout(toggle,10);
      }
    });
  },

  'should receive a presence update after subscription and only once': function(done) {
    var notifications = [];
    // subscribe online with client 2
    // cache the notifications to client 2
    client2.presence('test').on(function(message){
      notifications.push(message);
    }).subscribe(function() {
      // set client 1 to online
      client.presence('test').set('online', function() {
        client2.presence('test').get(function(message) {
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

  'syncing a presence should automatically subscribe to that resource': function(done) {
    client2.presence('test').on(function(message) {
      if (message.op == 'client_online') {
        assert.deepEqual(message.value, {
          userId: client.configuration('userId'),
          clientId: client.currentClientId(),
          userData: client.configuration('userData')
        });
        done();
      }
    }).sync();

    client.presence('test').set('online');
  },

  'userData will persist when a presence is updated': function(done) {
    this.timeout(18*1000);
    var scope = 'test';
    var verify = function(message) {
      assert.equal(message.op, 'get');
      assert.deepEqual(message.to, 'presence:/dev/' + scope);
      assert.ok(message.value['123']);
      assert.equal(message.value['123'].userType, 0);
      assert.deepEqual(message.value['123'].clients[client.currentClientId()], { name: 'tester' });
    };

    client.presence(scope).set('online', function() {
      var presence = client2.presence(scope).sync({version: 2}, function(message) {
        verify(message);
        setTimeout(function() {
          presence.get({version:2}, function(message) {
            verify(message);
            done();
          });
        }, 16000); //Wait for Autopub (15 sec)
      });
    });
  },

  'calling fullSync multiple times does not alter the result if users remain connected': function(done) {
    this.timeout(18*1000);
    var notifications = [], getCounter = 0;
    client2.presence('test').on(function(message){
      notifications.push(message);
    }).subscribe(function() {
      // set client 1 to online
      client.presence('test').set('online', function() {

        var foo = setInterval(function() {
          client2.presence('test').get(function(message) {
            // both should show client 1 as online
            assert.equal('get', message.op);
            assert.deepEqual({ '123': 0 }, message.value);

            assert.equal(notifications.length, 2);
            assert.equal(notifications[0].op, 'online');
            assert.deepEqual(notifications[0].value, { '123': 0 });
            assert.equal(notifications[1].op, 'client_online');
            assert.equal(notifications[1].value.userId, 123);
            assert.equal(notifications[1].value.clientId, client._socket.id);
            getCounter++;
          });
        }, 200);

        setTimeout(function() {
          clearInterval(foo);
          done();
        }, 16*1000);
      });
    });
  },

  'a presence will not be set to offline during the grace period but will be offline after it': function(done) {
    enabled = true;
    this.timeout(19*1000);
    var notifications = [];
    // subscribe online with client 2
    // cache the notifications to client 2
    client2.presence('test').on(function(message){
      logging.info('Receive message', message);
      notifications.push(message);
    }).subscribe(function() {
      // set client 1 to online
      client.presence('test').set('online');
      // disconnect client 1 - ensure that this happens later the online
      setTimeout(function() {
        client.dealloc('test');
        // do an explicit get as well after slightly less than the grace period
        setTimeout(function() {
          client2.presence('test').get(function(message) {
            logging.info('FOOOOO1', message, notifications);
            // both should show client 1 as online
            assert.equal('get', message.op);
            assert.deepEqual({ '123': 0 }, message.value);

            // we should have received a online notification
            assert.ok(notifications.some(function(m) { return (m.op == 'online');}));
            // This does not hold now that we have client_online/client_offline notifications: assert.equal(1, notifications.length);

            // a presence be set to offline after the grace period
            setTimeout(function() {
              client2.presence('test').get(function(message) {
                logging.info('FOOOOO2', message, notifications);
                // both should show client 1 as offline
                assert.equal(message.op, 'get');
                assert.deepEqual(message.value, {});

                assert.ok(notifications.some(function(m) { return (m.op == 'offline');}));
                // broken due to new notifications: assert.equal(2, notifications.length);
                client.alloc('test', done); //realloc client
              });
            }, 3*1000);
          });
        }, 13*1000);
      }, 5);
    });
  }
};
