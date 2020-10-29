/* globals describe, it */
const chai = require('chai')
const expect = chai.expect

describe('PresenceManager', function () {
  const PresenceManager = require('../src/core/resources/presence/presence_manager')

  describe('#disconnectRemoteClient', function () {
    it('sends implicit offline message without updating redis', function (done) {
      const scope = 'presence:/foo/bar'
      const sentry = { on: function () {} }
      const clientSessionId = 'abcdef'

      const presenceManager = new PresenceManager(scope, {}, sentry)
      presenceManager.processRedisEntry = function (message, callbackFn) {
        expect(message).to.deep.equal({
          userId: undefined,
          userType: undefined,
          clientId: clientSessionId,
          online: false,
          explicit: false
        })
        callbackFn()
      }
      presenceManager.disconnectRemoteClient(clientSessionId, function (err) {
        done(err)
      })
    })
  })
})
