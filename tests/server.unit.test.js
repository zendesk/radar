/* globals describe, it, beforeEach, afterEach*/
var common = require('./common.js')
var assert = require('assert')
var sinon = require('sinon')
var chai = require('chai')
var expect = chai.expect
var subscribeMessage = {
  op: 'subscribe',
  to: 'presence:/z1/test/ticket/1'
}
var radarServer

chai.use(require('sinon-chai'))

describe('given a server', function () {
  var socket

  beforeEach(function (done) {
    radarServer = common.createRadarServer(done)
    socket = {
      id: 1
    }
  })

  afterEach(function (done) {
    radarServer.terminate(done)
  })

  it('should emit resource:new when allocating a new resource', function (done) {
    radarServer.on('resource:new', function (resource) {
      assert.equal(resource.to, subscribeMessage.to)
      done()
    })

    setTimeout(function () {
      radarServer._processMessage(socket, subscribeMessage)
    }, 100)
  })

  it('should emit resource:new when allocating a new resource, but not on subsequent calls', function (done) {
    var called = false

    radarServer.on('resource:new', function (resource) {
      assert(!called)
      called = true

      setImmediate(function () {
        radarServer._processMessage(socket, subscribeMessage)
      })
    })

    setTimeout(function () {
      radarServer._processMessage(socket, subscribeMessage)
      setTimeout(done, 1800)
    }, 100)
  })

  it('should emit resource:destroy when a resource is destroyed', function (done) {
    var stubResource = {
      destroy: function () {}
    }

    radarServer.on('resource:destroy', function (resource) {
      expect(resource).to.equal(stubResource)
      done()
    })

    radarServer.resources = {
      'status:/test/foo': stubResource
    }

    radarServer.destroyResource('status:/test/foo')
  })

  it('should return an error when an invalid message type is sent', function (done) {
    var invalidMessage = {
      to: 'invalid:/thing'
    }

    socket.send = function (message) {
      assert.equal(message.value, 'unknown_type')
      done()
    }

    radarServer._processMessage(socket, invalidMessage)
  })

  it('should unwrap batch messages', function (done) {
    var batchMessage = {
      op: 'batch',
      length: 2,
      value: [
        {
          to: 'presence:/dev/test/ticket/1',
          op: 'subscribe'
        },
        {
          to: 'presence:/dev/test/ticket/2',
          op: 'subscribe'
        }
      ]
    }

    socket.send = function (x) {}

    radarServer._handleResourceMessage = sinon.spy()

    radarServer._processMessage(socket, batchMessage)

    setTimeout(function () {
      expect(radarServer._handleResourceMessage).to.have.been.called.twice
      done()
    }, 20)
  })

  it('should stamp incoming messages', function (done) {
    var message = {
      to: 'presence:/dev/test/ticket/1',
      op: 'subscribe'
    }

    radarServer.on('resource:new', function (resource) {
      resource.subscribe(socket.id, { ack: 1 })

      resource.on('message:incoming', function (incomingMessage) {
        assert(incomingMessage.stamp.id !== undefined)
        assert.equal(incomingMessage.stamp.clientId, socket.id)
        assert.equal(incomingMessage.stamp.sentryId, radarServer.sentry.name)
        done()
      })
    })

    setTimeout(function () {
      radarServer._processMessage(socket, message)
    }, 100)
  })

  describe('Sentry setup', function () {
    it('registers sentry on down handler', function () {
      var sentry = radarServer.sentry
      var listenerCount = require('events').listenerCount
      expect(listenerCount(sentry, 'down')).to.equal(1)
    })

    describe('#_onSentryDown', function () {
      var stubStore
      beforeEach(function () {
        stubStore = {
          clientSessionIdsForSentryId: sinon.stub().returns(['client1', 'client2'])
        }
        radarServer.resources = {
          123: {type: 'presence', manager: {
            store: stubStore,
            disconnectRemoteClient: sinon.stub()
          }, destroy: sinon.stub()},
          234: {type: 'presence', manager: {
            store: stubStore,
            disconnectRemoteClient: sinon.stub()
          }, destroy: sinon.stub()}
        }
      })

      it('calls disconnectRemoteClient for all presences associated with down sentryId', function (done) {
        radarServer._onSentryDown('sentry1')
        radarServer.on('profiling', function () {
          expect(radarServer.resources[123].manager.disconnectRemoteClient).to.have.been.calledTwice
          expect(radarServer.resources[234].manager.disconnectRemoteClient).to.have.been.calledTwice
          done()
        })
      })

      it('emits profiling event', function (done) {
        radarServer._onSentryDown('sentry1')
        radarServer.on('profiling', function (e) {
          expect(e.name).to.equal('_onSentryDown')
          expect(e.duration).to.be.a('number')
          expect(e.data.sessionCount).to.equal(4)
          expect(e.data.sentryId).to.equal('sentry1')
          done()
        })
      })
    })
  })
})
