/* globals describe, it, beforeEach */
var common = require('./common.js')
var assert = require('assert')
var RadarTypes = require('../core/lib/type.js')
var controlMessage = {
  to: 'control:/dev/test',
  op: 'nameSync',
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
var LegacyAuthManager = require('../middleware').LegacyAuthManager
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
      socket.send = function (message) {
        assert.equal('ack', message.op)
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
        assert.equal('err', message.op)
        assert.equal('auth', message.value)
        done()
      }

      radarServer._processMessage(socket, controlMessage)
    })
  })
})
