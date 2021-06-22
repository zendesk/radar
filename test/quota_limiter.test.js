/* globals describe, it, beforeEach */
const assert = require('assert')
const { QuotaLimiter } = require('../src/middleware')
const limit = 1
const clientId = '1'
const clientId2 = '2'
const toPrefix = 'presence://thing/'
const to = toPrefix + '1'
let quotaLimiter

describe('QuotaLimiter', function () {
  beforeEach(function () {
    quotaLimiter = new QuotaLimiter(limit)
  })

  it('add', function () {
    assert.strictEqual(quotaLimiter.count(clientId), 0)
    quotaLimiter.add(clientId, to)
    assert.strictEqual(quotaLimiter.count(clientId), 1)
  })

  it('remove', function () {
    quotaLimiter.add(clientId, to)
    quotaLimiter.remove(clientId, to)
    assert.strictEqual(quotaLimiter.count(clientId), 0)
  })

  it('remove before adding', function () {
    quotaLimiter.remove(clientId, to)
    assert.strictEqual(quotaLimiter.count(clientId), 0)
  })

  it('isAboveLimit', function () {
    quotaLimiter.add(clientId, to)
    assert(quotaLimiter.isAboveLimit(clientId))
  })

  it('duplicates should not count', function () {
    quotaLimiter.add(clientId, to)
    assert(!quotaLimiter.add(clientId, to))
    assert.strictEqual(quotaLimiter.count(clientId), 1)
  })

  it('removing by id', function () {
    quotaLimiter.add(clientId, to)
    quotaLimiter.add(clientId2, to)

    assert.strictEqual(quotaLimiter.count(clientId), 1)
    assert.strictEqual(quotaLimiter.count(clientId2), 1)

    quotaLimiter.removeById(clientId)

    assert.strictEqual(quotaLimiter.count(clientId), 0)
    assert.strictEqual(quotaLimiter.count(clientId2), 1)
  })

  it('removing by to', function () {
    quotaLimiter.add(clientId, to)
    quotaLimiter.add(clientId2, to)

    assert.strictEqual(quotaLimiter.count(clientId), 1)
    assert.strictEqual(quotaLimiter.count(clientId2), 1)

    quotaLimiter.removeByTo(to)

    assert.strictEqual(quotaLimiter.count(clientId), 0)
    assert.strictEqual(quotaLimiter.count(clientId2), 0)
  })
})
