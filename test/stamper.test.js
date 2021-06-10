/* globals describe, it */
const assert = require('assert')
const Stamper = require('../src/core/stamper.js')
const sentryName = 'theSentryName'
const clientId = 'clientId'

Stamper.setup('theSentryName')

describe('a Stamper service', function () {
  it('adds a stamp object to objects', function () {
    const message = {}

    Stamper.stamp(message, clientId)

    assert(message.stamp)
    assert(message.stamp.id)
    assert.strictEqual(message.stamp.clientId, clientId)
    assert.strictEqual(message.stamp.sentryId, sentryName)
  })

  it('allows optional client id', function () {
    const message = {}

    Stamper.stamp(message)

    assert(message.stamp)
    assert(message.stamp.id)
    assert.strictEqual(message.stamp.clientId, undefined)
    assert.strictEqual(message.stamp.sentryId, sentryName)
  })

  it('does not override id if present', function () {
    const message = { stamp: { id: 1 } }

    Stamper.stamp(message, clientId)

    assert.strictEqual(message.stamp.id, 1)
    assert.strictEqual(message.stamp.clientId, clientId)
  })
})
