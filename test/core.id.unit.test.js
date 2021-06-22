/* globals describe, it, beforeEach */
/* eslint-disable no-unused-expressions */

const chai = require('chai')
const expect = chai.expect
const _ = require('lodash')
const sinon = require('sinon')
chai.use(require('sinon-chai'))

describe('id', function () {
  const id = require('../src/core/id')

  beforeEach(function () {
    id.setGenerator(id.defaultGenerator)
  })

  it('can generate unique string ids', function () {
    const ids = []
    ids[0] = id()
    ids[1] = id()
    ids[2] = id()
    expect(ids[0]).to.be.a('string')
    expect(ids[1]).to.be.a('string')
    expect(ids[2]).to.be.a('string')
    expect(_.uniq(ids)).to.deep.equal(ids)
  })

  describe('.setGenerator', function () {
    it('can override the function used to generate ids', function () {
      const generator = sinon.stub().returns('abc')
      id.setGenerator(generator)
      const out = id()
      expect(generator).to.have.been.called
      expect(out).to.equal('abc')
    })
  })
  describe('.defaultGenerator', function () {
    it('is the default generator function', function () {
      expect(id.defaultGenerator).to.be.a('function')
      expect(id.defaultGenerator()).to.be.a('string')
    })
    it('is read-only', function () {
      expect(function () {
        'use strict'
        id.defaultGenerator = function () {}
      }).to.throw()
    })
  })
})
