var assert = require('assert'),
    RateLimiter = require('../core/rate_limiter.js'),
    limit = 1,
    clientId = '1', 
    clientId2 = '2', 
    toPrefix = 'presence://thing/',
    to = toPrefix + '1',
    rateLimiter;

describe('rateLimiter', function() {
  beforeEach(function() {
    rateLimiter = new RateLimiter(limit);
  });

  it('add', function(){
    assert.equal(rateLimiter.count(clientId), 0);
    rateLimiter.add(clientId, to);
    assert.equal(rateLimiter.count(clientId), 1);
  });

  it('remove', function(){
    rateLimiter.add(clientId, to);
    rateLimiter.remove(clientId, to);
    assert.equal(rateLimiter.count(clientId), 0);
  });

  it('remove before adding', function(){
    rateLimiter.remove(clientId, to);
    assert.equal(rateLimiter.count(clientId), 0);
  });

  it('isAboveLimit', function(){
    rateLimiter.add(clientId, to);
    assert(rateLimiter.isAboveLimit(clientId));
    assert(!rateLimiter.isAboveLimit(clientId, 2));
  });

  it ('duplicates should not count', function() {
    rateLimiter.add(clientId, to);  
    assert( ! rateLimiter.add(clientId, to) );
    assert.equal(rateLimiter.count(clientId), 1);
  });

  it('removing by id', function() {
    rateLimiter.add(clientId, to);
    rateLimiter.add(clientId2, to);

    assert.equal(rateLimiter.count(clientId), 1);
    assert.equal(rateLimiter.count(clientId2), 1);

    rateLimiter.removeById(clientId);

    assert.equal(rateLimiter.count(clientId), 0);
    assert.equal(rateLimiter.count(clientId2), 1);
  });

  it('removing by to', function() {
    rateLimiter.add(clientId, to);
    rateLimiter.add(clientId2, to);

    assert.equal(rateLimiter.count(clientId), 1);
    assert.equal(rateLimiter.count(clientId2), 1);

    rateLimiter.removeByTo(to);

    assert.equal(rateLimiter.count(clientId), 0);
    assert.equal(rateLimiter.count(clientId2), 0);
  });
});
