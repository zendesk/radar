var assert = require('assert'),

  Persistence = require('../../lib/persistence.js');

var redis = require('redis');

var client;

exports['given a resource'] = {

  before: function(done) {
    client = redis.createClient();
    done();
  },

  after: function(done) {
    client.end();
    done();
  },

  beforeEach: function(done) {
    done();
  },

  'non JSON redis string should be returned as is (ie. corrupted data is not throwing error)': function(done) {

    client.del("foo")
    client.hset("foo", "bar1", "this string should be stringified when inside redis");

    Persistence.readHashAll("foo", function(result) {
      assert.deepEqual({bar1: "this string should be stringified when inside redis"}, result)
      done()
    })

  }
};

// if this module is the script being run, then run the tests:
if (module == require.main) {
  var mocha = require('child_process').spawn('mocha', [ '--colors', '--ui', 'exports', '--reporter', 'spec', __filename ]);
  mocha.stdout.pipe(process.stdout);
  mocha.stderr.pipe(process.stderr);
}
