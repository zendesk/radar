/* globals describe, it, beforeEach */
var assert = require('assert')
var QuotaLimiter = require('../middleware').QuotaLimiter
var limit = 1
var clientId = '1'
var clientId2 = '2'
var toPrefix = 'presence://thing/'
var to = toPrefix + '1'
var quotaLimiter

describe('QuotaLimiter', function () {
  beforeEach(function () {
    quotaLimiter = new QuotaLimiter(limit)
  })

  it('add', function () {
    assert.equal(quotaLimiter.count(clientId), 0)
    quotaLimiter.add(clientId, to)
    assert.equal(quotaLimiter.count(clientId), 1)
  })

  it('remove', function () {
    quotaLimiter.add(clientId, to)
    quotaLimiter.remove(clientId, to)
    assert.equal(quotaLimiter.count(clientId), 0)
  })

  it('remove before adding', function () {
    quotaLimiter.remove(clientId, to)
    assert.equal(quotaLimiter.count(clientId), 0)
  })

  it('isAboveLimit', function () {
    quotaLimiter.add(clientId, to)
    assert(quotaLimiter.isAboveLimit(clientId))
  })

  it('duplicates should not count', function () {
    quotaLimiter.add(clientId, to)
    assert(!quotaLimiter.add(clientId, to))
    assert.equal(quotaLimiter.count(clientId), 1)
  })

  it('removing by id', function () {
    quotaLimiter.add(clientId, to)
    quotaLimiter.add(clientId2, to)

    assert.equal(quotaLimiter.count(clientId), 1)
    assert.equal(quotaLimiter.count(clientId2), 1)

    quotaLimiter.removeById(clientId)

    assert.equal(quotaLimiter.count(clientId), 0)
    assert.equal(quotaLimiter.count(clientId2), 1)
  })

  it('removing by to', function () {
    quotaLimiter.add(clientId, to)
    quotaLimiter.add(clientId2, to)

    assert.equal(quotaLimiter.count(clientId), 1)
    assert.equal(quotaLimiter.count(clientId2), 1)

    quotaLimiter.removeByTo(to)

    assert.equal(quotaLimiter.count(clientId), 0)
    assert.equal(quotaLimiter.count(clientId2), 0)
  })
})
