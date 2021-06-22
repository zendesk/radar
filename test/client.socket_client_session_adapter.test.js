/* globals describe, it, beforeEach */
/* eslint-disable no-unused-expressions */

const SocketClientSessionAdapter = require('../src/client/socket_client_session_adapter')
const ClientSession = require('../src/client/client_session')
const chai = require('chai')
chai.use(require('sinon-chai'))
chai.use(require('chai-interface'))
const expect = chai.expect
const sinon = require('sinon')

describe('SocketClientSessionAdapter', function () {
  let socketClientSessionAdapter
  beforeEach(function () {
    socketClientSessionAdapter = new SocketClientSessionAdapter(ClientSession)
  })

  it('can be instantiated', function () {
    expect(socketClientSessionAdapter)
      .to.be.instanceof(SocketClientSessionAdapter)
  })

  it('has interface', function () {
    expect(socketClientSessionAdapter).to.have.interface({
      canAdapt: Function,
      adapt: Function
    })
  })

  it('takes ClientSession constructor in own constructor', function () {
    function Foo () {}
    socketClientSessionAdapter = new SocketClientSessionAdapter(Foo)
    expect(socketClientSessionAdapter.ClientSession)
      .to.equal(Foo)
  })

  describe('#canAdapt', function () {
    describe('given a socket-like object', function () {
      const obj = {
        id: 5,
        send: function () {},
        on: function () {},
        once: function () {},
        removeListener: function () {}
      }
      it('returns true', function () {
        expect(socketClientSessionAdapter.canAdapt(obj))
          .to.be.true
      })
    })
    describe('given non-socket-like object', function () {
      const obj = { foo: 'bar' }
      it('returns false', function () {
        expect(socketClientSessionAdapter.canAdapt(obj))
          .to.be.false
      })
    })
    describe('given null', function () {
      it('returns false', function () {
        expect(socketClientSessionAdapter.canAdapt(null))
          .to.be.false
      })
    })
  })

  describe('#adapt', function () {
    describe('given a socket-like object', function () {
      const socket = {
        id: 'foo'
      }
      let ctor

      beforeEach(function () {
        ctor = sinon.stub()
        socketClientSessionAdapter.ClientSession = ctor
      })

      it('news ClientSession with id and transport', function () {
        socketClientSessionAdapter.adapt(socket)
        expect(ctor)
          .to.have.been.calledWith(undefined, 'foo', undefined, undefined, socket)
        expect(ctor)
          .to.have.been.calledWithNew
      })
    })
  })
})
