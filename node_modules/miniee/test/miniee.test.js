var assert = require('assert'),
    MiniEventEmitter = require('../miniee.js');

// set and emit an event using a string

var ee;
exports['given a new miniee'] = {

  beforeEach: function(done) {
    ee = new MiniEventEmitter();
    done();
  },

  afterEach: function(done) {
    done();
  },

  'should be able to set a listener using a string': function(done) {
    ee.on('test', function(arg) { assert.ok(arg === 'success'); done(); } );
    ee.emit('test', 'success');
  },

  'should be able to set a listener using a regexp': function(done) {
    ee.on(/test.*/, function(arg) { assert.ok(arg === 'success'); done(); } );
    ee.emit('test', 'success');
  },

  'a regexp listener should match varying events': function(done) {
    var assertions = 0;
    ee.on(/test.*/, function(arg) {
      if(arg === 'success') {
        assert.ok(true);
        assertions++;
      }
      if(arg == 'final') {
        assert.ok(true);
        assertions++;
        assert.equal(2, assertions);
        done();
      }
    });
    ee.emit('testing', 'success');
    ee.emit('test', 'final');
  },

  'listeners set using once should only fire once': function(done) {
    var assertions = 0;
    ee.once(/test.*/, function(arg) {
      if(arg === 'success') {
        assert.ok(true);
        assertions++;
      }
      if(arg == 'final') {
        assert.ok(false);
        assertions++;
      }
    });
    ee.emit('testing', 'success');
    ee.emit('test', 'final');
    done();
  },

  'can set multiple listeners with the same string': function(done) {
    var assertions = 0;
    ee.on('test', function(arg) { assert.ok(arg === 'success'); assertions++; } );
    ee.on('test', function(arg) { assert.ok(arg === 'success'); assertions++; assert.equal(2, assertions); done(); } );
    ee.emit('test', 'success');
  },

  'can set multiple listeners with the same regexp': function(done) {
    var assertions = 0;
    ee.on(/aaa.*/, function(arg) { assert.ok(arg === 'success'); assertions++; } );
    ee.on(/aaa.*/, function(arg) { assert.ok(arg === 'success'); assertions++; assert.equal(2, assertions); done(); } );
    ee.emit('aaaa', 'success');
  },

  'can pass an arbitrary number of arguments on events': function(done) {
    ee.on('test', function(a, b, c, d, e, f, g, h) {
      assert.equal(a, 'as');
      assert.equal(b, 'easy');
      assert.equal(c, 'as');
      assert.equal(d, '1');
      assert.equal(e, '2');
      assert.equal(f, '3');
      assert.equal(g, 'it');
      assert.equal(h, 'works');
      done();
    });
    ee.emit('test', 'as', 'easy', 'as', '1', '2', '3', 'it', 'works');
  },

  'setting more than one once() will still trigger all events': function(done) {
    var assertions = 0;
    ee.once(/aaa.*/, function(arg) { assert.ok(arg === 'success'); assertions++; } );
    ee.on(/aaa.*/, function(arg) { assert.ok(arg === 'success'); assertions++; } );
    ee.once(/aaa.*/, function(arg) { assert.ok(arg === 'success'); assertions++; done(); } );
    ee.emit('aaaa', 'success');
  },

  'a when callback is only removed when it returns true': function(done) {
    var items = [];
    ee.when(/aaa.*/, function(message) {
      items.push(message);
      return (items.length > 2);
    });
    ee.emit('aaaa', 1);
    ee.emit('aaaa', 2);
    ee.emit('aaaa', 3);
    ee.emit('aaaa', 4);

    assert.ok(items.some(function(message) {return message == 1;}));
    assert.ok(items.some(function(message) {return message == 2;}));
    assert.ok(items.some(function(message) {return message == 3;}));
    assert.ok(!items.some(function(message) {return message == 4;}));
    assert.equal(3, items.length);
    done();
  },

  'can remove a single callback by string': function(done) {
    var fail = function() { assert.ok(false); };
    ee.on('tickets:21', fail);
    ee.once('tickets:21', fail);
    ee.removeListener('tickets:21', fail);
    ee.emit('tickets:21', 'data');
    setTimeout(function() {
      assert.ok(true);
      done();
    }, 10);
  },

  'can remove a single callback by regexp': function(done) {
    var fail = function() { assert.ok(false); };
    ee.on(new RegExp('^tickets:*'), fail);
    ee.once(new RegExp('^tickets:*'), fail);
    ee.removeListener(new RegExp('^tickets:*'), fail);
    ee.emit('tickets:21', 'data');
    setTimeout(function() {
      done();
    }, 10);
  },

  'can remove all listeners from an event by string': function(done) {
    var fail = function() { assert.ok(false); };
    ee.on('tickets:21', fail);
    ee.once('tickets:21', fail);
    ee.removeAllListeners('tickets:21');
    ee.emit('tickets:21', 'data');
    setTimeout(function() {
      done();
    }, 10);
  },

  'can remove all listeners from an event by regexp': function(done) {
    var fail = function() { assert.ok(false); };
    ee.on(new RegExp('^tickets:*'), fail);
    ee.once(new RegExp('^tickets:*'), fail);
    ee.removeAllListeners(new RegExp('^tickets:*'));
    ee.emit('tickets:21', 'data');
    setTimeout(function() {
      done();
    }, 10);
  }

};


// if this module is the script being run, then run the tests:
if (module == require.main) {
  var mocha = require('child_process').spawn('mocha', [ '--colors', '--ui', 'exports', '--reporter', 'spec', __filename ]);
  mocha.stdout.pipe(process.stdout);
  mocha.stderr.pipe(process.stderr);
}
