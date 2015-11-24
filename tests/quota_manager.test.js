var assert = require('assert'),
  QuotaManager = require('../middleware').QuotaManager,
  quotaManager,
  client = {
    id: 1,
    send: function () {}
  },
  resource = {
    to: 'scope'
  },
  limitedType = {
    name: 'limited',
    policy: { limit: 1 }
  },
  syncMessage = {
    op: 'sync',
    to: 'scope'
  },
  unsubscribeMessage = {
    op: 'unsubscribe',
    to: 'scope'
  },
  subscribeMessage = {
    op: 'subscribe',
    to: 'scope'
  },
  otherMessage = {
    op: 'other',
    to: 'scope'
  }

var assertLimitCount = function (manager, type, client, count, done) {
  var limiter = manager.getLimiter(type)
  assert(limiter)
  assert.equal(limiter.count(client.id), count)
  if (done) { done(); }
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

        otherSubscribeMessage = { to: 'scope2', op: 'subscribe' }
        quotaManager.checkLimits(client, otherSubscribeMessage, limitedType, function (err) {
          assert(err)
          done()
        })
      })
    })

    it('should limit sync ops', function (done) {
      quotaManager.updateLimits(client, resource, syncMessage, limitedType, function (err) {
        assert(err === undefined)

        otherSubscribeMessage = { to: 'scope2', op: 'subscribe' }
        quotaManager.checkLimits(client, otherSubscribeMessage, limitedType, function (err) {
          assert(err)
          done()
        })
      })
    })

    it('should not limit unknown ops', function (done) {
      quotaManager.updateLimits(client, resource, otherMessage, limitedType, function (err) {
        assert(err === undefined)

        otherExtraMessage = { to: 'scope2', op: 'subscribe' }
        quotaManager.checkLimits(client, otherExtraMessage, limitedType, function (err) {
          assert(err === undefined)
          done()
        })
      })
    })
  })

  describe('when a resource gets destroyed', function () {
    it('should clean up', function (done) {
      var limiter

      quotaManager.updateLimits(client, resource, subscribeMessage, limitedType, function () {
        limiter = quotaManager.getLimiter(limitedType)
        assert.equal(limiter.count(client.id), 1)

        quotaManager.destroyByResource(resource, limitedType, function () {
          limiter = quotaManager.getLimiter(limitedType)
          assert.equal(limiter.count(client.id), 0)
          done()
        })
      })
    })
  })

  describe('when a client gets destroyed', function () {
    it('should clean up', function (done) {
      var limiter

      quotaManager.updateLimits(client, resource, subscribeMessage, limitedType, function () {
        limiter = quotaManager.getLimiter(limitedType)
        assert.equal(limiter.count(client.id), 1)

        quotaManager.destroyByClient(client, resource, limitedType, function () {
          limiter = quotaManager.getLimiter(limitedType)
          assert.equal(limiter.count(client.id), 0)
          done()
        })
      })
    })
  })
})
