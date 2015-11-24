var assert = require('assert'),
  Stamper = require('../core/stamper.js'),
  sentryName = 'theSentryName',
  clientId = 'clientId'

Stamper.setup('theSentryName')

describe('a Stamper service', function () {
  it('adds a stamp object to objects', function () {
    var message = {}

    Stamper.stamp(message, clientId)

    assert(message.stamp)
    assert(message.stamp.id)
    assert.equal(message.stamp.clientId, clientId)
    assert.equal(message.stamp.sentryId, sentryName)
  })

  it('allows optional client id', function () {
    var message = {}

    Stamper.stamp(message)

    assert(message.stamp)
    assert(message.stamp.id)
    assert.equal(message.stamp.clientId, undefined)
    assert.equal(message.stamp.sentryId, sentryName)
  })

  it('does not override id if present', function () {
    var message = {stamp: { id: 1 } }

    Stamper.stamp(message, clientId)

    assert.equal(message.stamp.id, 1)
    assert.equal(message.stamp.clientId, clientId)
  })
})
