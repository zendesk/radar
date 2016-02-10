/* globals describe, it */
var chai = require('chai')
var expect = chai.expect

describe('PresenceManager', function () {
  var PresenceManager = require('../core/lib/resources/presence/presence_manager')

  describe('#disconnectRemoteClient', function () {
    it('sends implicit offline message without updating redis', function (done) {
      var scope = 'presence:/foo/bar'
      var sentry = {on: function () {}}
      var clientSessionId = 'abcdef'

      var presenceManager = new PresenceManager(scope, {}, sentry)
      presenceManager.processRedisEntry = function (message, callback) {
        expect(message).to.deep.equal({
          userId: undefined,
          userType: undefined,
          clientId: clientSessionId,
          online: false,
          explicit: false
        })
        callback()
      }
      presenceManager.disconnectRemoteClient(clientSessionId, function (err) {
        done(err)
      })
    })
  })
})
