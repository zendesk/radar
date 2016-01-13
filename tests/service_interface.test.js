/* globals describe, it, beforeEach */

var sinon = require('sinon')
var chai = require('chai')
chai.use(require('sinon-chai'))
var expect = require('chai').expect
var proxyquire = require('proxyquire')

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
    it('returns a Status', function (done) {
      var Status = function () {}
      Status.prototype._get = sinon.stub().yieldsAsync({a: 1, b: 2})

      var ServiceInterface = proxyquire('../server/service_interface', {
        '../core': {Status: Status}
      })
      serviceInterface = new ServiceInterface()

      var req = {
        method: 'GET',
        url: '/radar/service?to=status:/foo/bar'
      }
      var res = {
        write: function (value) {
          expect(value).to.equal('{"op":"get","to":"status:/foo/bar","value":{"a":1,"b":2}}')
        },
        end: function () {
          expect(Status.prototype._get).to.have.been.calledWith('status:/foo/bar')
          done()
        }
      }
      serviceInterface.middleware(req, res)
    })

    it('returns a Presence', function (done) {
      var PresenceManager = function () {}
      PresenceManager.prototype.fullRead = sinon.stub().yieldsAsync({'1452560641403': 2})
      var Presence = function () {}
      var ServiceInterface = proxyquire('../server/service_interface', {
        '../core': {
          PresenceManager: PresenceManager,
          Presence: Presence
        }
      })
      serviceInterface = new ServiceInterface()

      var req = {
        method: 'GET',
        url: '/radar/service?to=presence:/foo/baz'
      }
      var res = {
        write: function (value) {
          expect(value).to.equal('{"op":"get","to":"presence:/foo/baz","value":{"1452560641403":2}}')
        },
        end: function () {
          done()
        }
      }
      serviceInterface.middleware(req, res)
    })

    it('supports batch gets', function (done) {
      var expectedResponse = {
        op: 'batch',
        length: 2,
        value: [
          {
            op: 'get',
            to: 'status:/foo/bar',
            value: 'message'
          },
          {
            op: 'get',
            to: 'status:/foo/baz',
            value: 'message'
          }
        ]
      }

      var Status = function () {}
      Status.prototype._get = sinon.stub().yieldsAsync('message')

      var ServiceInterface = proxyquire('../server/service_interface', {
        '../core': {Status: Status}
      })
      serviceInterface = new ServiceInterface()

      var req = {
        method: 'GET',
        url: '/radar/service?to=status:/foo/bar,status:/foo/baz'
      }
      var res = {
        write: function (value) {
          expect(value).to.equal(JSON.stringify(expectedResponse))
        },
        end: function () {
          expect(Status.prototype._get).to.have.been.calledWith('status:/foo/bar')
          done()
        }
      }
      serviceInterface.middleware(req, res)
    })
  })
})
