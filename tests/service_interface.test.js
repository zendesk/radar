/* globals describe, it, beforeEach */

var sinon = require('sinon')
var chai = require('chai')
chai.use(require('sinon-chai'))
var expect = require('chai').expect
var literalStream = require('literal-stream')
// require('minilog').enable()

describe('ServiceInterface', function () {
  var ServiceInterface = require('../server/service_interface')
  var serviceInterface
  beforeEach(function () {
    serviceInterface = new ServiceInterface()
  })

  describe('Routing middleware', function () {
    it('responds to requests in /radar/service/*', function (done) {
      var req = {
        url: '/radar/service/foo'
      }
      var res = {write: sinon.spy(), end: done}
      var next = sinon.spy()
      serviceInterface.middleware(req, res, next)

      expect(next).to.not.have.been.called
    })
    it('delegates requests not in /radar/service/*', function (done) {
      var req = {
        url: '/some/other/path'
      }
      var res = {}
      serviceInterface.middleware(req, res, done)
    })
  })

  describe('GET', function () {
    it('builds a GET message', function (done) {
      var req = {
        method: 'GET',
        url: '/radar/service?to=status:/foo/bar'
      }
      serviceInterface._postMessage = function (message, req, res) {
        expect(message).to.deep.equal({
          op: 'get',
          to: 'status:/foo/bar'
        })
        done()
      }

      serviceInterface.middleware(req, {})
    })
  })

  describe('POST', function () {
    it('accepts an incoming message', function (done) {
      var message = {
        op: 'set',
        to: 'status:/test/result',
        value: 'pending'
      }
      var req = postReq(message)
      var res = {}
      serviceInterface._postMessage = function (incomingMessage) {
        expect(incomingMessage).to.deep.equal(message)
        done()
      }
      serviceInterface.middleware(req, res)
    })

    it('requires content-type application/json', function (done) {
      var req = postReq({
        op: 'set',
        to: 'status:/test/result',
        value: 'pending'
      })
      req.headers['content-type'] = 'some bad mime type'
      var res = {
        write: function () {},
        end: function () {
          expect(res.statusCode).to.equal(415)
          done()
        }
      }
      serviceInterface.middleware(req, res)
    })
    it('requires valid json in body', function (done) {
      var req = literalStream('some non-json garbage')
      req.method = 'POST'
      req.headers = {
        'content-type': 'application/json'
      }
      req.url = '/radar/service'
      var res = {
        write: function () {},
        end: function () {
          expect(res.statusCode).to.equal(400)
          done()
        }
      }
      serviceInterface.middleware(req, res)
    })
    describe('_postMessage', function () {
      it('emits request event with stubbed client session and message', function (done) {
        var msg = {
          op: 'set',
          to: 'status:/test/result',
          value: 'pending'
        }

        serviceInterface.on('request', function (clientSession, message) {
          expect(message).to.deep.equal(msg)
          expect(clientSession.send).to.be.a('function')
          done()
        })

        var req = {}
        var res = {}

        serviceInterface._postMessage(msg, req, res)
      })

      describe('middleware', function () {
        it('runs onServiceInterfacePostMessage after parsing message emitting request', function (done) {
          var msg = {
            op: 'set',
            to: 'status:/test/result',
            value: 'pending'
          }

          serviceInterface._middlewareRunner = {
            runMiddleware: function (type, _msg, _req, _res, cb) {
              expect(type).to.equal('onServiceInterfacePostMessage')
              expect(_msg).to.equal(msg)
              expect(_req).to.equal(req)
              expect(_res).to.equal(res)
              cb()
            }
          }

          serviceInterface.on('request', function (clientSession, message) {
            done()
          })

          var req = {}
          var res = {}

          serviceInterface._postMessage(msg, req, res)
        })
        it('can modify the message', function (done) {
          var msg = {
            op: 'set',
            to: 'status:/test/result',
            value: 'pending'
          }

          serviceInterface._middlewareRunner = {
            runMiddleware: function (type, _msg, _req, _res, cb) {
              _msg.otherKey = 'string'
              cb()
            }
          }

          serviceInterface.on('request', function (clientSession, message) {
            expect(message.otherKey).to.equal('string')
            done()
          })

          var req = {}
          var res = {}

          serviceInterface._postMessage(msg, req, res)
        })
      })

      it('uses the req.id for the clientSession.id', function (done) {
        var msg = {
          op: 'set',
          to: 'status:/test/result',
          value: 'pending'
        }

        serviceInterface.on('request', function (clientSession, message) {
          expect(clientSession.id).to.equal('asdfg')
          done()
        })

        var req = {id: 'asdfg'}
        var res = {}

        serviceInterface._postMessage(msg, req, res)
      })
      it('uses the req.id for the message.ack if not set', function (done) {
        var msg = {
          op: 'set',
          to: 'status:/test/result',
          value: 'pending'
        }

        serviceInterface.on('request', function (clientSession, message) {
          expect(message.ack).to.equal(clientSession.id)
          done()
        })

        var req = {id: 'asdfg'}
        var res = {}

        serviceInterface._postMessage(msg, req, res)
      })
      it('does not overwrite message.ack if specified', function (done) {
        var msg = {
          op: 'set',
          to: 'status:/test/result',
          value: 'pending',
          ack: 1234
        }

        serviceInterface.on('request', function (clientSession, message) {
          expect(message.ack).to.equal(1234)
          done()
        })

        var req = {}
        var res = {}

        serviceInterface._postMessage(msg, req, res)
      })
      it('clientSession.send writes and ends the res', function (done) {
        var msg = {op: 'get'}

        serviceInterface.on('request', function (clientSession, message) {
          clientSession.send({message: 'contents'})
        })

        var req = {}
        var res = {
          write: sinon.spy(),
          end: function () {
            expect(res.write).to.have.been.calledWith('{"message":"contents"}')
            done()
          }
        }

        serviceInterface._postMessage(msg, req, res)
      })
    })
    describe('op filtering', function () {
      it('allows get', expect200('get'))
      it('allows set', expect200('set'))
      it('disallows batch', expect400('batch'))
      it('disallows nameSync', expect400('nameSync'))
      it('disallows subscribe', expect400('subscribe'))
      it('disallows sync', expect400('sync'))
      it('disallows unsubscribe', expect400('unsubscripe'))

      function expect200 (op) {
        return function (done) {
          return tryOp(op, 200, done)
        }
      }

      function expect400 (op) {
        return function (done) {
          return tryOp(op, 400, done)
        }
      }

      function tryOp (op, expectedStatusCode, done) {
        var msg = {
          op: op
        }

        serviceInterface.on('request', function (clientSession, message) {
          clientSession.send({message: 'contents'})
        })

        var req = postReq(msg)
        var res = {
          statusCode: 200,
          write: sinon.spy(),
          end: function () {
            expect(res.statusCode).to.equal(expectedStatusCode)
            done()
          }
        }

        serviceInterface.middleware(req, res)
      }
    })
  })
})

function postReq (body) {
  var req = literalStream(JSON.stringify(body))
  req.method = 'POST'
  req.headers = {
    'content-type': 'application/json'
  }
  req.url = '/radar/service'

  return req
}