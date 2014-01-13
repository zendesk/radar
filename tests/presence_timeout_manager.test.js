var PresenceTimeoutManager = require('../core/lib/resources/presence/presence_timeout_manager.js');
var assert = require('assert');

var timeoutManager;

exports['presence timeout manager'] = {



  'before': function() {
    timeoutManager = new PresenceTimeoutManager();
  },

  'afterEach': function() {
    timeoutManager.removeAllListeners();
  },

  'timeout should fire at least after the given delay': function(done) {

    this.timeout(500);

    var now = Date.now();
    timeoutManager.once('timeout', function(key) {
      if(key === 'key1') {
        assert((now + 400) <= Date.now() );
        done();
      }
    });

    timeoutManager.schedule('key1', 400);
  },

  'timeout should not fire if cancelled': function(done) {

    this.timeout(1000);

    setTimeout(done, 800);

    var now = Date.now();
    timeoutManager.once('timeout', function(key) {
      if(key === 'key2') {
        assert.fail('the trigger was cancelled and should not have fired');
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
        done();
      }
    });

    timeoutManager.schedule('key5', 200);
    timeoutManager.schedule('key6', 300);
    timeoutManager.schedule('key7', 400);
  },

  'schedule, cancel, schedule a timeout should fire once and at the last scheduled time': function(done) {

    this.timeout(500);

    var now = Date.now();
    timeoutManager.on('timeout', function(key) {
      if(key === 'key8') {
        assert( (now + 400) <= Date.now() );
        done();
      }
    });

    timeoutManager.schedule('key8', 200);
    timeoutManager.cancel('key8');
    timeoutManager.schedule('key8', 400);
  },

  'it should be possible to store data and have it back on timeout': function(done) {

    this.timeout(500);

    var now = Date.now();
    timeoutManager.once('timeout', function(key, data) {
      if(key === 'key9') {
        assert((now + 400) <= Date.now() );
        assert.deepEqual(data, {'white': 'cat'});
        done();
      }
    });

    timeoutManager.schedule('key9', 400, {'white': 'cat'});
  },

  'scheduling a timeout twice should fire it once at the latest defined time (t1 > t2)': function(done) {

    this.timeout(500);

    var now = Date.now();

    timeoutManager.on('timeout', function(key) {
      if(key === 'key10') {
        assert((now + 400) <= Date.now() );
      }
      done()
    });

    timeoutManager.schedule('key10', 1000);
    timeoutManager.schedule('key10', 400);
  },

  'scheduling a timeout twice should fire it once at the latest defined time (t1 < t2)': function(done) {

    this.timeout(500);

    var now = Date.now();

    timeoutManager.on('timeout', function(key) {
      if(key === 'key11') {
        assert((now + 400) <= Date.now() );
      }
      done()
    });

    timeoutManager.schedule('key11', 200);
    timeoutManager.schedule('key11', 400);
  }


};

