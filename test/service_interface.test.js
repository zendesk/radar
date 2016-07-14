/* globals describe, it, beforeEach */

var sinon = require('sinon')
var chai = require('chai')
chai.use(require('sinon-chai'))
var expect = require('chai').expect
var literalStream = require('literal-stream')
var _ = require('lodash')
var uuid = require('uuid')

describe('ServiceInterface', function () {
  var ServiceInterface = require('../src/server/service_interface')
  var serviceInterface
  beforeEach(function () {
    serviceInterface = new ServiceInterface()
  })

  function getReq (o) {
    return _.extend({
      method: 'GET',
      url: '/radar/service'
    }, o)
  }

  function stubRes (o) {
    return _.extend({
      statusCode: 200,
      setHeader: sinon.spy(),
      write: sinon.spy(),
      end: sinon.spy()
    }, o)
  }

  describe('Routing middleware', function () {
    it('responds to requests in /radar/service/*', function (done) {
      var req = getReq()
      var res = stubRes({end: done})
      var next = sinon.spy()
      serviceInterface.middleware(req, res, next)

      expect(next).to.not.have.been.called
    })
    it('delegates requests not in /radar/service/*', function (done) {
      var req = getReq({
        url: '/some/other/path'
      })
      var res = stubRes()
      serviceInterface.middleware(req, res, done)
    })
  })

  describe('GET', function () {
    it('builds a GET message', function (done) {
      var req = getReq({
        url: '/radar/service?to=status:/foo/bar'
      })
      serviceInterface._processIncomingMessage = function (message, req, res) {
        expect(message).to.deep.equal({
          op: 'get',
          to: 'status:/foo/bar'
        })
        done()
      }

      serviceInterface.middleware(req, stubRes())
    })

    it('returns 400 if missing to parameter on querystring', function (done) {
      var req = getReq({
        url: '/radar/service'
      })
      var res = stubRes({
        end: function () {
          expect(res.statusCode).to.equal(400)
          done()
        }
      })
      serviceInterface.middleware(req, res)
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
      var res = stubRes()
      serviceInterface._processIncomingMessage = function (incomingMessage) {
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
      var res = stubRes({
        end: function () {
          expect(res.statusCode).to.equal(415)
          done()
        }
      })
      serviceInterface.middleware(req, res)
    })

    it('allows content-type with charset', function (done) {
      var req = postReq({
        op: 'get',
        to: 'status:/test/result',
        key: 'abc'
      })

      req.headers['content-type'] = 'application/json;charset=UTF-8'
      var res = stubRes({
        end: function () {
          expect(res.statusCode).to.equal(200)
          done()
        }
      })
      serviceInterface.on('request', function (clientSession, message) {
        clientSession.send({status: 'ok'})
      })
      serviceInterface.middleware(req, res)
    })

    it('requires valid json in body', function (done) {
      var req = literalStream('some non-json garbage')
      req.method = 'POST'
      req.headers = {
        'content-type': 'application/json'
      }
      req.url = '/radar/service'
      var res = stubRes({
        end: function () {
          expect(res.statusCode).to.equal(400)
          done()
        }
      })
      serviceInterface.middleware(req, res)
    })

    it('generates a uuid req.id if not already set', function (done) {
      var req = getReq()
      var res = stubRes({
        end: function () {
          expect(req).to.have.property('id')
          // gen.id is a uuid:
          expect(uuid.unparse(uuid.parse(req.id))).to.equal(req.id)
          done()
        }
      })

      serviceInterface.middleware(req, res)
    })
    it('does not overwrite req.id if already set', function (done) {
      var req = getReq({
        id: 'preset id'
      })
      var res = stubRes({
        end: function () {
          expect(req.id).to.equal('preset id')
          done()
        }
      })

      serviceInterface.middleware(req, res)
    })

    describe('_processIncomingMessage', function () {
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
        var res = {end: function () {}}

        serviceInterface._processIncomingMessage(msg, req, res)
      })

      describe('middleware', function () {
        it('runs onServiceInterfaceIncomingMessage after parsing message emitting request', function (done) {
          var msg = {
            op: 'set',
            to: 'status:/test/result',
            value: 'pending'
          }

          serviceInterface._middlewareRunner = {
            runMiddleware: function (type, _msg, _req, _res, cb) {
              expect(type).to.equal('onServiceInterfaceIncomingMessage')
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
          var res = {end: function () {}}

          serviceInterface._processIncomingMessage(msg, req, res)
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
          var res = {end: function () {}}

          serviceInterface._processIncomingMessage(msg, req, res)
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
        var res = {end: function () {}}

        serviceInterface._processIncomingMessage(msg, req, res)
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
        var res = {end: function () {}}

        serviceInterface._processIncomingMessage(msg, req, res)
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

        serviceInterface._processIncomingMessage(msg, req, res)
      })
      describe('clientSession.send', function () {
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

          serviceInterface._processIncomingMessage(msg, req, res)
        })

        describe('when response message is an error', function () {
          it('raises it to http statusCode error 400', function (done) {
            var msg = {op: 'get'}

            serviceInterface.on('request', function (clientSession, message) {
              clientSession.send({op: 'err', value: 'invalid'})
            })

            var req = {}
            var res = {
              statusCode: 200,
              write: sinon.spy(),
              end: function () {
                expect(res.statusCode).to.equal(400)
                done()
              }
            }

            serviceInterface._processIncomingMessage(msg, req, res)
          })
          describe('given auth err message', function () {
            var msg = {op: 'get'}

            beforeEach(function () {
              serviceInterface.on('request', function (clientSession, message) {
                clientSession.send({op: 'err', value: 'auth'})
              })
            })

            it('auth errors are statusCode 403 by default', function (done) {
              var req = {}
              var res = {
                statusCode: 200,
                write: sinon.spy(),
                end: function () {
                  expect(res.statusCode).to.equal(403)
                  done()
                }
              }

              serviceInterface._processIncomingMessage(msg, req, res)
            })
            it('if res.statusCode is already 401 or 403, existing value is used', function (done) {
              var req = {}
              var res = {
                statusCode: 401,
                write: sinon.spy(),
                end: function () {
                  expect(res.statusCode).to.equal(401)
                  done()
                }
              }

              serviceInterface._processIncomingMessage(msg, req, res)
            })
          })
        })

        it('if HttpResponse is already ended, does not try to write again', function (done) {
          var msg = {op: 'get'}

          serviceInterface.on('request', function (clientSession, message) {
            clientSession.send({message: '1'})
            clientSession.send({message: '2'})
          })

          var req = {}
          var res = {
            write: sinon.spy(),
            end: function () {
              res.finished = true
              expect(res.write).to.have.been.called.once
              done()
            }
          }

          serviceInterface._processIncomingMessage(msg, req, res)
        })
      })
    })

    describe('fast return for command routes', function () {
      describe('when no ack specified in message', function () {
        var msg = {
          op: 'set'
        }
        it('returns 202 Accepted', function (done) {
          // serviceInterface.on('request', function (clientSession, message) {
          //   clientSession.send({message: 'contents'})
          // })

          var req = postReq(msg)
          var res = stubRes({
            end: function () {
              this.finished = true
              expect(res.statusCode).to.equal(202)
              done()
            }
          })

          serviceInterface.middleware(req, res)
        })
        it('ends http response before emitting request event', function (done) {
          var called = []

          var req = postReq(msg)
          var res = stubRes({
            end: function () {
              if (this.finished) { return }
              this.finished = true
              called.push('res.end')
              expect(called).to.deep.equal(['res.end'])
            }
          })

          serviceInterface.on('request', function () {
            called.push('emit.request')
            expect(called).to.deep.equal(['res.end', 'emit.request'])
            done()
          })

          serviceInterface.middleware(req, res)
        })
      })
      describe('when ack specified in message', function () {
        var msg = {
          op: 'set',
          ack: '23'
        }
        it('returns 200 OK', function (done) {
          serviceInterface.on('request', function (clientSession, message) {
            clientSession.send({message: 'contents'})
          })

          var req = postReq(msg)
          var res = stubRes({
            end: function () {
              this.finished = true
              expect(res.statusCode).to.equal(200)
              done()
            }
          })

          serviceInterface.middleware(req, res)
        })
      })
    })

    describe('op filtering', function () {
      it('allows get', expectResponse(200, 'get'))
      it('allows set', expectResponse(202, 'set'))
      it('disallows batch', expectResponse(400, 'batch'))
      it('disallows nameSync', expectResponse(400, 'nameSync'))
      it('disallows subscribe', expectResponse(400, 'subscribe'))
      it('disallows sync', expectResponse(400, 'sync'))
      it('disallows unsubscribe', expectResponse(400, 'unsubscripe'))

      function expectResponse (code, op) {
        return function (done) {
          return tryOp(op, code, done)
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
        var res = stubRes({
          end: function () {
            this.finished = true
            expect(res.statusCode).to.equal(expectedStatusCode)
            done()
          }
        })

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
