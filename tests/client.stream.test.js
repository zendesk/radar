var common = require('./common.js'),
    assert = require('assert'),
    Persistence = require('../core').Persistence,
    Client = require('radar_client').constructor,
    StreamMessage = require('./lib/assert_helper.js').StreamMessage,
    Tracker = require('callback_tracker'),
    radar, client, client2;

describe('When using the stream resource', function() {
  var s = new StreamMessage('dev', 'test');
  before(function(done) {
    var track = Tracker.create('before', done);

    radar = common.spawnRadar();
    radar.sendCommand('start', common.configuration,  function() {
      client = common.getClient('dev', 123, 0, { name: 'tester1' }, track('client 1 ready'));
      client2 = common.getClient('dev', 246, 0, { name: 'tester2' }, track('client 2 ready'));
    });
  });

  after(function(done) {
    client.dealloc('test');
    client2.dealloc('test');
    common.stopRadar(radar, done);
  });

  beforeEach(function(done) {
    s.teardown();
    client.stream('test').removeAllListeners();
    client2.stream('test').removeAllListeners();

    var track = Tracker.create('before each', done);
    client.stream('test').unsubscribe(track('client unsubscribe'));
    client2.stream('test').unsubscribe(track('client2 unsubscribe'));
    common.startPersistence(track('redis cleanup'));
  });

  describe('when using subscribe/unsubscribe', function() {
    it('should subscribe successfully with ack', function(done) {

      client.stream('test').subscribe(function(msg) {
        s.for_sender(client).assert_ack_for_subscribe(msg);
        done();
      });
    });

    it('should unsubscribe successfully with ack', function(done) {
      client.stream('test').unsubscribe(function(msg) {
        s.for_sender(client).assert_ack_for_unsubscribe(msg);
        done();
      });
    });

    // sending a message should only send to each subscriber, but only once
    it('should receive a message only once per subscriber', function(done) {
      var message  = { state: 'test1'},
          finished = {};

      function validate(msg, client_name) {
        assert.ok( !finished[client_name] );
        finished[client_name] = true;
        if(finished.client && finished.client2) {
          setTimeout(done,30);
        }
      }

      client.stream('test').on(function(msg) {
        s.for_sender(client2).assert_push_notification(msg, 'ticket/1', 'open', message);
        validate(msg, 'client');
      });
      client2.stream('test').on(function(msg) {
        s.for_sender(client2).assert_push_notification(msg, 'ticket/1', 'open', message);
        validate(msg, 'client2');
      });

      client.stream('test').subscribe();
      client2.stream('test').subscribe().push('ticket/1', 'open', message);
    });

    it('can chain subscribe and on/once', function(done) {
      client.stream('test').subscribe().once(function(message) {
        s.for_sender(client2).assert_push_notification(message, 'ticket/1', 'updated', { by: 123 });
        done();
      });
      client2.stream('test').push('ticket/1', 'updated', { by: 123 });
    });

    it('should only receive message when subscribed', function(done) {
      //send three messages, client2 will assert if it receieves any,
      //Stop test when we receive all three at client 1

      var message = { state: 'test1'},
          message2 = { state: 'test2' },
          message3 = { state: 'test3' };

      client2.stream('test').on(function(msg) {
        assert.ok(false);
      });

      s.on(3, function() {
        s.assert_message_sequence([
          [ 'ticket/1', 'open', message ],
          [ 'ticket/2', 'close', message2 ],
          [ 'ticket/3', 'edit', message3 ]
        ]);
        done();
      });

      client.stream('test').on(s.notify).subscribe();
      client2.stream('test').push('ticket/1', 'open', message);
      client2.stream('test').push('ticket/2', 'close', message2);
      client2.stream('test').push('ticket/3', 'edit', message3);
    });

    it('should not receive messages after unsubscribe', function(done) {
      //send two messages after client2 unsubscribes,
      // client2 will assert if it receives message 2 and 3
      //Stop test when we receive all three at client 1

      var message = { state: 'test1'};
      var message2 = { state: 'test2'};
      var message3 = { state: 'test3'};

      // test.numAssertions = 3;
      client2.stream('test').on(function(msg) {
        s.for_sender(client2).assert_push_notification(msg, 'ticket/1', 'open', message);
        client2.stream('test').unsubscribe().push('ticket/1', 'open', message2);
        client2.stream('test').push('ticket/1', 'open', message3);
      });

      client.stream('test').on(s.notify).subscribe();
      client2.stream('test').subscribe().push('ticket/1', 'open', message);
      s.on(3, function() {
        s.for_sender(client2).assert_message_sequence([
          [ 'ticket/1', 'open', message ],
          [ 'ticket/1', 'open', message2 ],
          [ 'ticket/1', 'open', message3 ]
        ]);
        done();
      });
    });

    describe("when using from option", function() {
      it('should receive missed messages on subscribe', function(done) {
        client.stream('test').on(s.notify).subscribe();
        client2.stream('test').push('ticket/1','open','first')
                              .push('ticket/1','open','second')
                              .push('ticket/1','open','third');
        s.on(3, function() {
          s.for_sender(client2).assert_message_sequence([
            [ 'ticket/1', 'open', "first" ],
            [ 'ticket/1', 'open', "second" ],
            [ 'ticket/1', 'open', "third" ]
          ]);
          client.stream('test').unsubscribe();
          client2.stream('test').push('ticket/1','open','fourth')
                                .push('ticket/1','open','fifth')
                                .push('ticket/1','open','sixth');
          client.stream('test').subscribe({from: s.notifications[2].id});
          s.fail_on_more_than(6);

          s.on(6, function() {
            s.for_sender(client2).assert_message_sequence([
              [ 'ticket/1', 'open', "fourth" ],
              [ 'ticket/1', 'open', "fifth" ],
              [ 'ticket/1', 'open', "sixth" ]
            ], 3);
            done();
          });
        });
      });

      it('should receive a sync-error if server ran out of history', function(done) {
        var s = new StreamMessage('dev', 'short_stream/1');
        client.stream('short_stream/1').on(s.notify).subscribe();
        client2.stream('short_stream/1').push('ticket/1','open','first')
                              .push('ticket/1','open','second')
                              .push('ticket/1','open','third')
                              .push('ticket/1','open','fourth');
        s.on(4, function() {
          s.for_sender(client2).assert_message_sequence([
            [ 'ticket/1', 'open', "first" ],
            [ 'ticket/1', 'open', "second" ],
            [ 'ticket/1', 'open', "third" ],
            [ 'ticket/1', 'open', "fourth" ]
          ]);
          client.stream('short_stream/1').unsubscribe();
          client2.stream('short_stream/1').push('ticket/1','open','fifth')
            .push('ticket/1','open','sixth', function() {
              client.stream('short_stream/1').subscribe({from: s.notifications[3].id});
            });
        });
        s.fail_on_more_than(5);
        s.on(5, function() {
          s.assert_sync_error_notification(s.notifications[4], { start: 5, end: 6, length: 2, from: 4 });
          done();
        });
      });

      it('should still be subscribed after a sync-error', function(done) {
        var s = new StreamMessage('dev', 'short_stream/2');
        client.stream('short_stream/2').on(s.notify).subscribe();
        client2.stream('short_stream/2').push('ticket/1','open','first')
                              .push('ticket/1','open','second')
                              .push('ticket/1','open','third')
                              .push('ticket/1','open','fourth');
        s.on(4, function() {
          s.for_sender(client2).assert_message_sequence([
            [ 'ticket/1', 'open', "first" ],
            [ 'ticket/1', 'open', "second" ],
            [ 'ticket/1', 'open', "third" ],
            [ 'ticket/1', 'open', "fourth" ]
          ]);
          client.stream('short_stream/2').unsubscribe();
          client2.stream('short_stream/2').push('ticket/1','open','fifth')
            .push('ticket/1','open','sixth', function() {
              client.stream('short_stream/2').subscribe({from: s.notifications[3].id});
            });
        });
        s.on(5, function() {
          s.assert_sync_error_notification(s.notifications[4], { start: 5, end: 6, length: 2, from: 4 });
          s.on(6, function() {
            s.for_sender(client2).assert_message_sequence([
              [ 'ticket/1', 'open', 'seventh']
            ], 5);

            done();
          });
          client2.stream('short_stream/2').push('ticket/1', 'open', 'seventh');
        });
      });

      it('should receive a sync-error if server does not keep history', function(done) {
        var s = new StreamMessage('dev', 'uncached_stream/1');
        client.stream('uncached_stream/1').on(s.notify).subscribe();
        client2.stream('uncached_stream/1').push('ticket/1','open','first')
                              .push('ticket/1','open','second')
                              .push('ticket/1','open','third')
                              .push('ticket/1','open','fourth');
        s.on(4, function() {
          s.for_sender(client2).assert_message_sequence([
            [ 'ticket/1', 'open', "first" ],
            [ 'ticket/1', 'open', "second" ],
            [ 'ticket/1', 'open', "third" ],
            [ 'ticket/1', 'open', "fourth" ]
          ]);
          client.stream('uncached_stream/1').subscribe({from: s.notifications[3].id});
        });

        s.fail_on_more_than(5);
        s.on(5, function() {
          s.assert_sync_error_notification(s.notifications[4], { length: 0, from: 4 });
          done();
        });
      });
    });
  });

  describe('push', function() {
    it('can acknowledge a push', function(done) {
      client.stream('test').push('ticket/1', 'open', 'foobar', function(message) {
        s.for_sender(client).assert_ack_for_push(message, 'ticket/1', 'open', 'foobar');
        done();
      });
    });
    it('can push a String', function(done) {
      client2.stream('test').on(function(message) {
        s.for_sender(client).assert_push_notification(message, 'ticket/1', 'open', 'foo');
        done();
      }).subscribe(function() {
        client.stream('test').push('ticket/1', 'open', 'foo');
      });
    });
    it('can push an Object', function(done) {
      client2.stream('test').on(function(message) {
        s.for_sender(client).assert_push_notification(message, 'ticket/1', 'open', { foo: 'bar' });
        done();
      }).subscribe(function() {
        client.stream('test').push('ticket/1', 'open', { foo: 'bar' });
      });
    });
  });

  describe('get', function() {
    it('can get a String', function(done) {
      var once_push = function() {
        client.stream('test').get(function(message) {
          s.assert_get_response(message, [
            [ 'ticket/1', 'open', 'foo', client ],
            [ 'ticket/1', 'close', 'foo', client ]
          ]);
          done();
        });
      };
      client.stream('test').push('ticket/1', 'open', 'foo');
      client.stream('test').push('ticket/1', 'close', 'foo', once_push);
    });

    it('can get an Object', function(done) {
      var once_push = function() {
        client.stream('test').get(function(message) {
          s.assert_get_response(message, [
            [ 'ticket/1', 'open', { hello: 'world' }, client ],
          ]);
          done();
        });
      };
      client.stream('test').push('ticket/1', 'open', { hello: 'world' }, once_push);
    });

    it('returns [] if empty', function(done) {

      client.stream('test').get(function(message) {
        s.assert_get_response(message, []);
        done();
      });
    });

    it('returns messages from specified message id', function(done) {
      client.stream('test').on(s.notify).subscribe();
      client2.stream('test').push('ticket/1','open','first')
                            .push('ticket/1','open','second')
                            .push('ticket/1','open','third');
      s.on(3, function() {
        s.for_sender(client2).assert_message_sequence([
          [ 'ticket/1', 'open', "first" ],
          [ 'ticket/1', 'open', "second" ],
          [ 'ticket/1', 'open', "third" ]
        ]);
        client.stream('test').unsubscribe();
        client2.stream('test').push('ticket/1','open','fourth')
                              .push('ticket/1','open','fifth')
                              .push('ticket/1','open','sixth');
        client.stream('test').subscribe({from: s.notifications[2].id});
        s.fail_on_more_than(6);

        s.on(6, function() {
          s.for_sender(client2).assert_message_sequence([
            [ 'ticket/1', 'open', "fourth" ],
            [ 'ticket/1', 'open', "fifth" ],
            [ 'ticket/1', 'open', "sixth" ]
          ], 3);
          done();
        });
      });
      done();//XXX
    });

    it('returns sync-error if server lacks required history', function(done) {
      done();//XXX
    });
  });

  describe('sync', function() {
    it('calls back with the value, does not notify', function(done) {
      //Make sure redis message has reflected.
      client2.stream('test').subscribe().push('ticket/1', 'open', 'foo').once(function() {
        client.stream('test').on(function(message) {
          assert.ok(false);
        }).sync(function(message) {
          s.assert_sync_response(message, [
            [ 'ticket/1', 'open', 'foo', client2 ]
          ]);
          setTimeout(done,50);
        });
      });
    });

    it('also subscribes', function(done) {
      client.stream('test').push('ticket/1', 'open', 'foo', function() {
        client.stream('test').on(function(message) {
          s.for_sender(client).assert_push_notification(message, 'ticket/1', 'open', 'bar');
          done();
        }).sync(function(message) {
          s.assert_sync_response(message, [
            ['ticket/1', 'open', 'foo', client]
          ]);
          client.stream('test').push('ticket/1', 'open', 'bar');
        });
      });
    });
    it('can sync a String', function(done) {
      client.stream('test').push('ticket/1', 'open', 'foo', function() {
        client.stream('test').sync(function(message) {
          s.assert_sync_response(message, [
            ['ticket/1', 'open', 'foo', client]
          ]);
          done();
        });
      });
    });
    it('can sync an Object', function(done) {
      client.stream('test').push('ticket/1', 'open', { foo: 'bar' }, function() {
        client.stream('test').sync(function(message) {
          s.assert_sync_response(message, [
            ['ticket/1', 'open', { foo: 'bar' }, client]
          ]);
          done();
        });
      });
    });
    it('returns [] when empty', function(done) {
      client.stream('test').sync(function(message) {
        s.assert_sync_response(message, []);
        done();
      });
    });
  });
});
