var assert = require('assert'),
    Persistence = require('../core/lib/persistence.js'),
    redis = require('redis'),
    client;

exports['given a resource'] = {

  before: function() {
    client = redis.createClient();
  },

  after: function() {
    client.end();
  },

  'non JSON redis string should be filtered out (ie. do not return corrupted data)': function(done) {

    var key = 'persistence.test';

    client.del(key);
    client.hset(key, 'bar1', 'this string should be filtered out');
    client.hset(key, 'bar2', '"this string should be returned"');

    Persistence.readHashAll(key, function(result) {
      assert.deepEqual({bar2: 'this string should be returned'}, result);
      done();
    });

  },

  'persisting messages serializes it when the message is an object': function(done) {
    // (nherment) TODO: the result should actually be deserialized because it is being serialized in persistOrdered()
    // The problem is that radar_client currently deserializes the response.
    // We need to make the client not deserialize the response so that we can deserialize it here.


    var key = 'persistence.messages.object.test';
    var objectValue = {
      foo: 'bar'
    };

    Persistence.persistOrdered(key, objectValue, function(err) {
      if(err) {
        return done(err);
      }
      Persistence.readOrderedWithScores(key, undefined, function(replies) {

        assert(replies instanceof Array);
        assert.equal(2, replies.length);
        assert.equal('string', typeof replies[0]);
        assert.equal(JSON.stringify(objectValue), replies[0]);
        done();
      });

    });
  },

  'persisting messages serializes it when the message is a string': function(done) {
    // (nherment) TODO: the result should actually be deserialized because it is being serialized in persistOrdered()
    // The problem is that radar_client currently deserializes the response.
    // We need to make the client not deserialize the response so that we can deserialize it here.


    var key = 'persistence.messages.string.test';
    var stringValue = 'Hello World';

    Persistence.persistOrdered(key, stringValue, function(err) {
      if(err) {
        return done(err);
      }
      Persistence.readOrderedWithScores(key, undefined, function(replies) {

        assert(replies instanceof Array);
        assert.equal(2, replies.length);
        assert.equal('string', typeof replies[0]);
        assert.equal(JSON.stringify(stringValue), replies[0]);
        done();
      });

    });
  }

};
