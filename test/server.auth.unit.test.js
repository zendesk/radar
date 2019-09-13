/* globals describe, it, beforeEach */
var common = require('./common.js')
var assert = require('assert')
var RadarTypes = require('../src/core/type.js')
var controlMessage = {
  to: 'control:/dev/test',
  op: 'ctl',
  options: {
    association: {
      id: 1,
      name: 1
    }
  }
}
var authProvider = {
  authorize: function (channel, message, client) {
    return false
  }
}
var authorizedType = {
  name: 'general control',
  type: 'Control',
  authProvider: authProvider,
  expression: /^control:/
}
var LegacyAuthManager = require('../src/middleware').LegacyAuthManager
var radarServer
var socket

describe('given a server', function () {
  describe('without authentication', function () {
    beforeEach(function (done) {
      radarServer = common.createRadarServer(done)
      radarServer.use(new LegacyAuthManager())
      socket = { id: 1 }
    })

    it('it should allow access', function (done) {
      radarServer._handleResourceMessage = function () {
        done()
      }
      radarServer._processMessage(socket, controlMessage)
    })
  })

  describe('with authentication', function () {
    beforeEach(function (done) {
      RadarTypes.replace([authorizedType])
      radarServer = common.createRadarServer(done)
      radarServer.use(new LegacyAuthManager())
      socket = { id: 1 }
    })

    it('it should prevent unauthorized access', function (done) {
      socket.send = function (message) {
        assert.strictEqual('err', message.op)
        assert.strictEqual('auth', message.value)
        done()
      }

      radarServer._processMessage(socket, controlMessage)
    })
  })
})
