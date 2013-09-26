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

  'non JSON redis string should be filtered out (ie. do not return corrupted data)': function(done) {

    var key = "persistence.test"

    client.del(key);
    client.hset(key, "bar1", "this string should be filtered out");
    client.hset(key, "bar2", "\"this string should be returned\"");

    Persistence.readHashAll(key, function(result) {
      assert.deepEqual({bar2: "this string should be returned"}, result);
      done();
    })

  }
};

// if this module is the script being run, then run the tests:
if (module == require.main) {
  var mocha = require('child_process').spawn('mocha', [ '--colors', '--ui', 'exports', '--reporter', 'spec', __filename ]);
  mocha.stdout.pipe(process.stdout);
  mocha.stderr.pipe(process.stderr);
}
