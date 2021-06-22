/* globals describe, it, beforeEach */
const common = require('./common.js')
const assert = require('assert')
const RadarTypes = require('../src/core/type.js')
const controlMessage = {
  to: 'control:/dev/test',
  op: 'ctl',
  options: {
    association: {
      id: 1,
      name: 1
    }
  }
}
const authProvider = {
  authorize: function (channel, message, client) {
    return false
  }
}
const authorizedType = {
  name: 'general control',
  type: 'Control',
  authProvider: authProvider,
  expression: /^control:/
}
const LegacyAuthManager = require('../src/middleware').LegacyAuthManager
let radarServer
let socket

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
