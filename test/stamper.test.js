/* globals describe, it */
var assert = require('assert')
var Stamper = require('../src/core/stamper.js')
var sentryName = 'theSentryName'
var clientId = 'clientId'

Stamper.setup('theSentryName')

describe('a Stamper service', function () {
  it('adds a stamp object to objects', function () {
    var message = {}

    Stamper.stamp(message, clientId)

    assert(message.stamp)
    assert(message.stamp.id)
    assert.strictEqual(message.stamp.clientId, clientId)
    assert.strictEqual(message.stamp.sentryId, sentryName)
  })

  it('allows optional client id', function () {
    var message = {}

    Stamper.stamp(message)

    assert(message.stamp)
    assert(message.stamp.id)
    assert.strictEqual(message.stamp.clientId, undefined)
    assert.strictEqual(message.stamp.sentryId, sentryName)
  })

  it('does not override id if present', function () {
    var message = { stamp: { id: 1 } }

    Stamper.stamp(message, clientId)

    assert.strictEqual(message.stamp.id, 1)
    assert.strictEqual(message.stamp.clientId, clientId)
  })
})
