var common = require('./common.js'),
    assert = require('assert'),
    Radar = require('../server/server.js'),
    Persistence = require('../core').Persistence,
    verbose = false,
    Client = require('radar_client').constructor,
    Minilog = require('minilog'),
    logging = require('minilog')('test');
if(verbose) {
  Minilog.pipe(Minilog.backends.nodeConsole);
}

exports['reconnect: given a server and two connected clients'] = {

  beforeEach: function(done) {
    var self = this,
        tasks = 0;
    function next() { tasks++; if (tasks == 3) done(); }
    common.startRadar(8009, this, function(){
      self.client = new Client().configure({ userId: 123, userType: 0, accountName: 'test', port: 8009, upgrade: false})
                    .once('ready', next).alloc('test');
      self.client2 = new Client().configure({ userId: 246, userType: 2, accountName: 'test', port: 8009, upgrade: false})
                    .once('ready', next).alloc('test');
    });
    Persistence.delWildCard('*:/test/*', next);
  },

  afterEach: function(done) {
    this.client.dealloc('test');
    this.client2.dealloc('test');
    common.endRadar(this, function() { Persistence.disconnect(done); });
  },

  'after a connection, create one subscription of each type, then disconnect. all subs should be restored and "reconnected" event': function(done) {
    this.timeout(30000);
    var self = this,
        client = this.client,
        eioClientId = this.client._socket.id,
        beforeDisconnect = [],
        afterDisconnect = [],
        clientEvents = [];

    client.once('disconnected', function() { clientEvents.push('disconnected'); });
    client.once('connected', function() { clientEvents.push('connected'); });
    client.once('ready', function() { clientEvents.push('ready'); });

    function checkEvents(arr) {
      return arr.some(function(i) { return i.to && i.to == 'message:/test/restore'; }) &&
             arr.some(function(i) { return i.to && i.to == 'presence:/test/restore'; }) &&
             arr.some(function(i) { return i.to && i.to == 'status:/test/restore'; });
    }

    // using the fact that messages are emitted to our advantage
    common.radar().on('subscribe', function(c, message) {
      if(eioClientId == c.id) {
        beforeDisconnect.push(message);

        if(beforeDisconnect.length == 3) {
          // now that all the subscriptions have been made, stop the server
          // then start it again to trigger a real disconnect
          setTimeout(function() {
            //console.log('Shutting down the server');
            common.endRadar(self, function() {
              common.startRadar(8009, self, function(){
                // re-establish listener
                common.radar().on('subscribe', function(c, message) {
                  afterDisconnect.push(message);

                  if(afterDisconnect.length == 3) {
                    setTimeout(function() {
                      //console.log(beforeDisconnect, afterDisconnect, clientEvents);
                      // assert that the subscriptions were established and re-established
                      assert.ok(checkEvents(beforeDisconnect));
                      assert.ok(checkEvents(afterDisconnect));
                      // assert that the client events were fired
                      assert.equal(clientEvents[0], 'disconnected');
                      assert.equal(clientEvents[1], 'connected');
                      assert.equal(clientEvents[2], 'ready');
                      done();
                    }, 500)
                  }
                });
                //console.log('Server started');
              });
            });
          }, 500); // allow time for messages to be delivered
        }
      }
    });

    client.message('restore').subscribe(function() {});
    client.presence('restore').subscribe(function() {});
    client.status('restore').subscribe(function() {});
  },

/*
  'presence is restored even after the server has expired the previous set(online)': function(done) {
    done();
  },

  */

  'restarting the server will not cause duplicate messages': function(done) {
    var client = this.client, client2 = this.client2, self = this, messages = [];
    this.timeout(30000);

    client.message('foo').on(function(msg) {
      messages.push(msg);
    }).sync();


    setTimeout(function() {
      client2.message('foo').publish('1');
      setTimeout(function() {
        common.endRadar(self, function() {
          common.startRadar(8009, self, function(){
            client.once('ready', function() {
              client2.message('foo').publish('2');
              setTimeout(function() {
                logging.debug(messages);
                assert.equal(messages.length, 2);
                assert.ok(messages.some(function(m) { return m.value == '1';}));
                assert.ok(messages.some(function(m) { return m.value == '2';}));
                done();
              }, 5000); // need wait here since reconnect is 2sec
            });
          });
        });
      }, 500); // allow time for messages to be delivered
    }, 500);

  }

};

// if this module is the script being run, then run the tests:
if (module == require.main) {
  var mocha = require('child_process').spawn('mocha', [ '--bail', '--colors', '--ui', 'exports', '--reporter', 'spec', __filename ]);
  mocha.stdout.pipe(process.stdout);
  mocha.stderr.pipe(process.stderr);
}
