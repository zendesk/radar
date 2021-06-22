/* globals describe, it, beforeEach */
const assert = require('assert')
const { QuotaManager } = require('../src/middleware')
let quotaManager
const client = {
  id: 1,
  send: function () {}
}
const resource = {
  to: 'scope'
}
const limitedType = {
  name: 'limited',
  policy: { limit: 1 }
}
const syncMessage = {
  op: 'sync',
  to: 'scope'
}
const unsubscribeMessage = {
  op: 'unsubscribe',
  to: 'scope'
}
const subscribeMessage = {
  op: 'subscribe',
  to: 'scope'
}
const otherMessage = {
  op: 'other',
  to: 'scope'
}

const assertLimitCount = function (manager, type, client, count, done) {
  const limiter = manager.getLimiter(type)
  assert(limiter)
  assert.strictEqual(limiter.count(client.id), count)
  if (done) { done() }
}

describe('QuotaManager', function () {
  beforeEach(function () {
    quotaManager = new QuotaManager()
  })

  describe('when counting (updateLimits)', function () {
    it('should count on limited types', function (done) {
      quotaManager.updateLimits(client, resource, subscribeMessage, limitedType, function () {
        assertLimitCount(quotaManager, limitedType, client, 1, done)
      })
    })

    it('should add subscribe ops', function (done) {
      quotaManager.updateLimits(client, resource, subscribeMessage, limitedType, function () {
        assertLimitCount(quotaManager, limitedType, client, 1, done)
      })
    })

    it('should add sync ops', function (done) {
      quotaManager.updateLimits(client, resource, syncMessage, limitedType, function () {
        assertLimitCount(quotaManager, limitedType, client, 1, done)
      })
    })

    it('should decrement on unsubscribe ops', function (done) {
      quotaManager.updateLimits(client, resource, subscribeMessage, limitedType, function () {
        assertLimitCount(quotaManager, limitedType, client, 1)
        quotaManager.updateLimits(client, resource, unsubscribeMessage, limitedType, function () {
          assertLimitCount(quotaManager, limitedType, client, 0, done)
        })
      })
    })
    it('should should skip unknown ops', function (done) {
      quotaManager.updateLimits(client, resource, otherMessage, limitedType, function () {
        assertLimitCount(quotaManager, limitedType, client, 0, done)
      })
    })
  })

  describe('when limiting (checkLimits)', function () {
    it('should limit subscribe ops', function (done) {
      quotaManager.updateLimits(client, resource, subscribeMessage, limitedType, function (err) {
        assert(err === undefined)

        const otherSubscribeMessage = { to: 'scope2', op: 'subscribe' }
        quotaManager.checkLimits(client, otherSubscribeMessage, limitedType, function (err) {
          assert(err)
          done()
        })
      })
    })

    it('should limit sync ops', function (done) {
      quotaManager.updateLimits(client, resource, syncMessage, limitedType, function (err) {
        assert(err === undefined)

        const otherSubscribeMessage = { to: 'scope2', op: 'subscribe' }
        quotaManager.checkLimits(client, otherSubscribeMessage, limitedType, function (err) {
          assert(err)
          done()
        })
      })
    })

    it('should not limit unknown ops', function (done) {
      quotaManager.updateLimits(client, resource, otherMessage, limitedType, function (err) {
        assert(err === undefined)

        const otherExtraMessage = { to: 'scope2', op: 'subscribe' }
        quotaManager.checkLimits(client, otherExtraMessage, limitedType, function (err) {
          assert(err === undefined)
          done()
        })
      })
    })
  })

  describe('when a resource gets destroyed', function () {
    it('should clean up', function (done) {
      let limiter

      quotaManager.updateLimits(client, resource, subscribeMessage, limitedType, function () {
        limiter = quotaManager.getLimiter(limitedType)
        assert.strictEqual(limiter.count(client.id), 1)

        quotaManager.destroyByResource(resource, limitedType, function () {
          limiter = quotaManager.getLimiter(limitedType)
          assert.strictEqual(limiter.count(client.id), 0)
          done()
        })
      })
    })
  })

  describe('when a client gets destroyed', function () {
    it('should clean up', function (done) {
      let limiter

      quotaManager.updateLimits(client, resource, subscribeMessage, limitedType, function () {
        limiter = quotaManager.getLimiter(limitedType)
        assert.strictEqual(limiter.count(client.id), 1)

        quotaManager.destroyByClient(client, resource, limitedType, function () {
          limiter = quotaManager.getLimiter(limitedType)
          assert.strictEqual(limiter.count(client.id), 0)
          done()
        })
      })
    })
  })
})
