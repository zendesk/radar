var PresenceTimeoutManager = require('../core/lib/resources/presence/presence_timeout_manager.js');
var assert = require('assert');

var timeoutManager;

exports['presence: given a server and two connected clients'] = {



  'before': function() {
    timeoutManager = new PresenceTimeoutManager();
  },

  'timeout should fire at least after the given delay': function(done) {

    this.timeout(500)

    var now = Date.now();
    timeoutManager.once('timeout', function(key) {
      if(key === 'key1') {
        assert((now + 400) <= Date.now() );
        done();
      }
      timeoutManager.removeListener('timeout', arguments.callee.caller);
    });

    timeoutManager.schedule('key1', 400);
  },

  'timeout should not fire if cancelled': function(done) {

    this.timeout(1000);

    setTimeout(done, 800);

    var now = Date.now();
    timeoutManager.once('timeout', function(key) {
      if(key === 'key2') {
        timeoutManager.removeAllListeners();
        throw new Error('the trigger was cancelled and should not have fired');
      }
    });

    timeoutManager.schedule('key2', 500);

    setTimeout(function() {
      timeoutManager.cancel('key2');
    }, 200);
  },

  'multiple scheduled timeout should fire': function(done) {

    this.timeout(500);

    var now = Date.now();
    var timeoutCount = 0;
    timeoutManager.on('timeout', function(key) {
      if(key === 'key3') {
        assert((now + 200) <= Date.now() );
        timeoutCount ++;
      }
      if(key === 'key4') {
        assert((now + 400) <= Date.now() );
        timeoutCount ++;
      }
      if(timeoutCount === 2) {
        timeoutManager.removeAllListeners();
        done()
      }
    });

    timeoutManager.schedule('key3', 200);
    timeoutManager.schedule('key4', 400);
  },

  'cancelled timeout should not impact others': function(done) {

    this.timeout(500);

    var now = Date.now();
    var timeoutCount = 0;
    timeoutManager.on('timeout', function(key) {
      if(key === 'key5') {
        assert( (now + 200) <= Date.now() );
        timeoutCount ++;
        timeoutManager.cancel('key6');
      }
      if(key === 'key6') {
        throw new Error('key6 was canceled and should not have fired');
      }
      if(key === 'key7') {
        assert( (now + 400) <= Date.now() );
        timeoutCount ++;
      }
      if(timeoutCount === 2) {
        timeoutManager.removeListener('timeout', arguments.callee.caller);
        done();
      }
    });

    timeoutManager.schedule('key5', 200);
    timeoutManager.schedule('key6', 300);
    timeoutManager.schedule('key7', 400);
  },


};

