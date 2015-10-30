var assert = require('assert'),
    Tracker = require('callback_tracker'),
    Sentry = require('../core/lib/resources/presence/sentry.js'),
    Persistence = require('persistence'),
    configuration = require('../configurator.js').load({persistence: true}),
    _ = require('underscore'),
    currentSentry = 0,
    sentry, sentryOne, sentryTwo, sentryThree, sentries = [],
    defaults = { 
      expiryOffset: 200,
      refreshInterval: 100,
      checkInterval: 200
    };

function newSentry(options) {
  var name = 'sentry-' + currentSentry++;

  return new Sentry(name, _.extend(defaults, (options || {}))); 
}

function assertSentriesKnowEachOther(sentries, done) {
  var sentryNames = sentries.map(function(s) { return s.name; });

  sentries.forEach(function(sentry) {
    _.mapObject(sentry.sentries, function(message) {
      assert(_.indexOf(sentryNames, message.name) >= -1);
    });
  });

  if (done) { done(); }
}

describe('a Server Entry (Sentry)', function() {
  before(function(done) {
    Persistence.setConfig(configuration.persistence);
    Persistence.connect(done);
  });

  afterEach(function(done) {
    Persistence.redis().del('sentry:/radar', function() {
      if (sentry) { sentry.stop(done); } else { done(); }
      sentries.forEach(function(s) { s.stop(); });
    });
  });

  it('start with callback', function(done) {
    sentry = newSentry();
    sentry.start(defaults, done);
  });

  describe('isDown', function() {
    it('initially, it should be down', function() {
      sentry = newSentry();
      assert.equal(sentry.isDown(sentry.name), true);
    });

    it('after start, it should be up', function() {
      sentry = newSentry();
      sentry.start(defaults, function() {
        assert.equal(sentry.isDown(sentry.name), false);
      });
    });

  });

  describe('keep alive', function() {
    it('should generate a valid sentry message', function() {
      sentry = newSentry();

      sentry.start(defaults, function() {
        assert.equal(sentry.sentries.length, 1);
        assert.equal(sentry.name, sentry.sentries[0].name);
      });
    }); 
  });

  describe('check & clean up', function() {
    beforeEach(function(done) {
      sentryOne = newSentry();
      sentryTwo = newSentry();
      sentries = [ sentryOne, sentryTwo ];

      sentryOne.start(defaults, function() {
        sentryTwo.start(defaults, done);
      });
    });

    it('after start, the sentries should know about each other', function(done) {
      var checkSentriesKnowEachOther = function() {
        sentries.forEach(function(s) {
          assert.equal(Object.keys(s.sentries).length, 2);
        });
        done();
      };

      setTimeout(checkSentriesKnowEachOther, 200);
    });

    it('after a down, and after check, sentries should clean up', function(done) {
      var checkForSentryTwoGone = function() {
        setTimeout(function() {
          assert.equal(sentryOne.sentries[sentryTwo.name], undefined);
          done();
        }, 300);
      };

      sentryTwo.stop(checkForSentryTwoGone);
    });
  });

  describe('complex scenario, with more than two sentries, when one dies', function() {
    it('all remaining sentries should do proper cleanup', function(done) {
      sentryOne = newSentry({ checkInterval: 10});
      sentryTwo = newSentry({ checkInterval: 20}); // It's important that sentryTwo is slower. 
      sentryThree = newSentry();
      sentries = [ sentryOne, sentryTwo, sentryThree ];

      var stopAndAssert = function() {
        // stop one
        sentryThree.stop(function() {
          setTimeout(function() {
            // assert existing sentries no longer know sentryThree. 
            assert.equal(sentryOne.sentries[sentryThree.name], undefined);
            assert.equal(sentryTwo.sentries[sentryThree.name], undefined);
            done();
          }, 300);
        });
      };

      // start everything...
      sentryOne.start(defaults, function() {
        sentryTwo.start(defaults, function() {
          sentryThree.start(defaults, function() {
            // assert ideal state, every one know each other
            assertSentriesKnowEachOther(sentries, stopAndAssert);
          });
        });
      });
    });  
  });

  describe('when emiting events', function() {
    it('should emit up when going up', function(done) {
      sentryOne = newSentry({ checkInterval: 10});
      sentryOne.on('up', function(name, message) {
        assert.equal(name, sentryOne.name);
        done();
      });

      sentryOne.start();
    }); 

    it('should emit down when noticing another sentry is no longer available', function(done) {
      sentryOne = newSentry();
      sentryTwo = newSentry();

      sentryOne.on('down', function(name, message) {
        assert.equal(name, sentryTwo.name);
        done();
      });

      sentryOne.start(defaults, function() {
        sentryTwo.start(defaults, function() {
          sentryTwo.stop();
        });
      });

    }); 
  });
});
