/* globals describe, it, beforeEach, afterEach*/
var common = require('./common.js')
var assert = require('assert')
var sinon = require('sinon')
var chai = require('chai')
var Server = require('../src/server/server')
var expect = chai.expect
var subscribeMessage = {
  op: 'subscribe',
  to: 'presence:/z1/test/ticket/1'
}
var radarServer
var listenerCount = require('events').listenerCount
// listenerCount isn't in node 0.10, so here's a basic polyfill
listenerCount = listenerCount || function (ee, event) {
  var listeners = ee && ee._events && ee._events[event]
  if (Array.isArray(listeners)) {
    return listeners.length
  } else if (typeof listeners === 'function') {
    return 1
  } else {
    return 0
  }
}

var EventEmitter = require('events').EventEmitter

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

  describe('#_onSocketConnection', function () {
    var stubClientSession
    var socket
    beforeEach(function () {
      stubClientSession = new EventEmitter()
      stubClientSession.id = 1
      radarServer.sessionManager = {add: function () { return stubClientSession }}
      socket = {id: 1}
      radarServer._onSocketConnection(socket)
    })
    it('registers clientSession on message handler', function () {
      expect(listenerCount(stubClientSession, 'message')).to.equal(1)
    })
    it('registers clientSession on end handler', function () {
      expect(listenerCount(stubClientSession, 'end')).to.equal(1)
    })
    describe('clientSesion on end handler', function () {
      it('calls onDestroyClient middleware for each resource', function (done) {
        radarServer.resources = {
          123: {subscribers: {1: stubClientSession}, unsubscribe: sinon.stub(), destroy: sinon.stub()},
          234: {subscribers: {1: stubClientSession}, unsubscribe: sinon.stub(), destroy: sinon.stub()}
        }

        var calls = []
        radarServer.runMiddleware = function () {
          calls.push(arguments)
          if (calls.length === 2) {
            check()
          }
        }

        function check () {
          expect(calls[0][0]).to.equal('onDestroyClient')
          expect(calls[0][1]).to.equal(socket)
          expect(calls[0][2]).to.equal(radarServer.resources[123])
          expect(calls[1][0]).to.equal('onDestroyClient')
          expect(calls[1][1]).to.equal(socket)
          expect(calls[1][2]).to.equal(radarServer.resources[234])
          done()
        }

        stubClientSession.emit('end')
      })

      it('calls resource.unsubscribe for each resource', function (done) {
        radarServer.resources = {
          123: {subscribers: {1: stubClientSession}, unsubscribe: sinon.stub(), destroy: sinon.stub()},
          234: {subscribers: {1: stubClientSession}, unsubscribe: sinon.stub(), destroy: sinon.stub()}
        }

        stubClientSession.emit('end')

        setTimeout(function () {
          expect(radarServer.resources[123].unsubscribe).to.have.been.calledWith(socket, false)
          expect(radarServer.resources[234].unsubscribe).to.have.been.calledWith(socket, false)
          done()
        }, 30)
      })
    })
  })

  describe('#attach', function () {
    it('returns ready promise', function () {
      var httpServer = require('http').createServer(function () {})
      var radarServer = new Server()

      var returned = radarServer.attach(httpServer, common.configuration)
      expect(returned).to.equal(radarServer.ready)
    })

    it('ready promise resolves once server is setup', function () {
      var httpServer = require('http').createServer(function () {})
      var radarServer = new Server()
      radarServer._stup = sinon.spy(radarServer, '_setup')
      return radarServer.attach(httpServer, common.configuration)
        .then(function () {
          expect(radarServer._setup).to.have.been.called
        })
    })
  })

  describe('Sentry setup', function () {
    it('registers sentry on down handler', function () {
      var sentry = radarServer.sentry

      expect(listenerCount(sentry, 'down')).to.equal(1)
    })

    it('forwards sentry on down event', function (done) {
      var sentry = radarServer.sentry

      radarServer.on('sentry:down', function (sentryId, message) {
        expect(sentryId).to.equal('sentryId')
        expect(message).to.deep.equal({message: true})
        done()
      })
      sentry.emit('down', 'sentryId', {message: true})
    })
    it('forwards sentry on up event', function (done) {
      var sentry = radarServer.sentry

      radarServer.on('sentry:up', function (sentryId, message) {
        expect(sentryId).to.equal('sentryId')
        expect(message).to.deep.equal({message: true})
        done()
      })
      sentry.emit('up', 'sentryId', {message: true})
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

      it('ignores presences that are destroyed during processing', function (done) {
        radarServer._onSentryDown('sentry1')
        radarServer.resources[234].destroyed = true
        radarServer.on('profiling', function () {
          expect(radarServer.resources[123].manager.disconnectRemoteClient).to.have.been.calledTwice
          expect(radarServer.resources[234].manager.disconnectRemoteClient).not.to.have.been.called
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
