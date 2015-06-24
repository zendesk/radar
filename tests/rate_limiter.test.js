var assert = require('assert'),
    RateLimiter = require('../core/rate_limiter.js'),
    limit = 1,
    clientId = '1', 
    clientId2 = '2', 
    namePrefix = 'presence://thing/',
    name = namePrefix + '1',
    rateLimiter;

describe('rateLimiter', function() {
  beforeEach(function() {
    rateLimiter = new RateLimiter(limit);
  });

  it('add', function(){
    assert.equal(rateLimiter.count(clientId), 0);
    rateLimiter.add(clientId, name);
    assert.equal(rateLimiter.count(clientId), 1);
  });

  it('remove', function(){
    rateLimiter.add(clientId, name);
    rateLimiter.remove(clientId, name);
    assert.equal(rateLimiter.count(clientId), 0);
  });

  it('remove before adding', function(){
    rateLimiter.remove(clientId, name);
    assert.equal(rateLimiter.count(clientId), 0);
  });

  it('isAboveLimit', function(){
    rateLimiter.add(clientId, name);
    assert(rateLimiter.isAboveLimit(clientId));
  });

  it ('duplicates should not count', function() {
    rateLimiter.add(clientId, name);  
    assert( ! rateLimiter.add(clientId, name) );
    assert.equal(rateLimiter.count(clientId), 1);
  });

  it('removing by id', function() {
    rateLimiter.add(clientId, name);
    rateLimiter.add(clientId2, name);

    assert.equal(rateLimiter.count(clientId), 1);
    assert.equal(rateLimiter.count(clientId2), 1);

    rateLimiter.removeById(clientId);

    assert.equal(rateLimiter.count(clientId), 0);
    assert.equal(rateLimiter.count(clientId2), 1);
  });

  it('removing by name', function() {
    rateLimiter.add(clientId, name);
    rateLimiter.add(clientId2, name);

    assert.equal(rateLimiter.count(clientId), 1);
    assert.equal(rateLimiter.count(clientId2), 1);

    rateLimiter.removeByName(name);

    assert.equal(rateLimiter.count(clientId), 0);
    assert.equal(rateLimiter.count(clientId2), 0);
  });
});
