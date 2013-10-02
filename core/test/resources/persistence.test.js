var assert = require('assert'),

Persistence = require('../../lib/persistence.js');

var redis = require('redis');

var client;

exports['given a resource'] = {

  before: function() {
    client = redis.createClient();
  },

  after: function() {
    client.end();
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