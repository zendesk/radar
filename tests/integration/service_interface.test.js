/* globals describe, it, beforeEach, before, after */
var expect = require('chai').expect
var fetch = require('node-fetch')
var qs = require('querystring')

var common = require('../common.js')

describe('Given a Radar server', function () {
  var endpoint
  var options
  var radar
  before(function (done) {
    radar = common.spawnRadar()
    radar.sendCommand('start', common.configuration, function () {
      done()
    })
  })
  after(function (done) {
    common.stopRadar(radar, done)
  })
  process.on('exit', function () {
    if (radar) { common.stopRadar(radar) }
  })

  beforeEach(function () {
    endpoint = 'http://localhost:' + radar.port + '/radar/service'
    options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({op: 'get', to: 'sd'})
    }
  })

  describe('given invalid content-type', function () {
    beforeEach(function () {
      delete options.headers['Content-Type']
    })
    it('returns 415', function () {
      return fetch(endpoint, options).then(function (res) {
        expect(res.status).to.equal(415)
      })
    })
  })

  describe('POST radar message', function () {
    describe('given invalid json body', function () {
      beforeEach(function () {
        options.body = JSON.stringify({
          op: 'get',
          to: 'status:/account/blah'
        }).substring(15)
      })
      it('returns error', function () {
        return fetch(endpoint, options).then(function (res) {
          expect(res.status).to.equal(400)
          return res.text().then(console.log)
        })
      })
    })

    describe('Presence get', function () {
      describe('given no clients online on a Presence resource', function () {
        it('gets v1', function () {
          options.body = JSON.stringify({
            op: 'get',
            to: 'presence:/account/ticket/1'
          })

          return fetch(endpoint, options).then(function (res) {
            expect(res.status).to.equal(200)

            return res.json()
          }).then(function (body) {
            expect(body).to.deep.equal({
              op: 'get',
              to: 'presence:/account/ticket/1',
              value: {}
            })
          })
        })
        it('gets v2', function () {
          options.body = JSON.stringify({
            op: 'get',
            to: 'presence:/account/ticket/1',
            options: {version: 2}
          })

          return fetch(endpoint, options).then(function (res) {
            expect(res.status).to.equal(200)

            return res.json()
          }).then(function (body) {
            expect(body).to.deep.equal({
              op: 'get',
              to: 'presence:/account/ticket/1',
              value: {}
            })
          })
        })
      })
      describe('given a client online on a presence resource', function () {
        var client
        var scope = 'test_presence_with_clients'
        var USER_TYPE_AGENT = 2
        before(function (done) {
          client = common.getClient('account', 123, USER_TYPE_AGENT, {}, function () {
            client.presence(scope).set('online', function (ack) {
              done()
            })
          })
        })

        after(function (done) {
          client.presence(scope).set('offline', function (ack) {
            client.dealloc('test')
            done()
          }).removeAllListeners()
        })

        it('gets v1', function () {
          options.body = JSON.stringify({
            op: 'get',
            to: 'presence:/account/' + scope
          })

          return fetch(endpoint, options).then(function (res) {
            expect(res.status).to.equal(200)
            return res.json()
          }).then(function (body) {
            expect(body).to.deep.equal({
              op: 'get',
              to: 'presence:/account/' + scope,
              value: {
                123: USER_TYPE_AGENT
              }
            })
          })
        })

        it('gets v2', function () {
          options.body = JSON.stringify({
            op: 'get',
            to: 'presence:/account/' + scope,
            options: {version: 2}
          })

          return fetch(endpoint, options).then(function (res) {
            expect(res.status).to.equal(200)
            return res.json()
          }).then(function (body) {
            var expected = {
              op: 'get',
              to: 'presence:/account/' + scope,
              value: {
                123: {
                  clients: {},
                  userType: USER_TYPE_AGENT
                }
              }
            }
            expected.value[123].clients[client.currentClientId()] = {}

            expect(body).to.deep.equal(expected)
          })
        })
      })
    })

    it('Status get', function () {
      options.body = JSON.stringify({
        op: 'get',
        to: 'status:/account/ticket/1'
      })

      return fetch(endpoint, options).then(function (res) {
        expect(res.status).to.equal(200)
        return res.json()
      }).then(function (body) {
        expect(body).to.deep.equal({
          op: 'get',
          to: 'status:/account/ticket/1',
          value: {}
        })
      })
    })

    describe('when setting and then getting a Status', function () {
      it('expects the same value back', function () {
        var value = Date.now()

        var set = Object.create(options)
        set.body = JSON.stringify({
          op: 'set',
          to: 'status:/account/name',
          key: 123,
          value: value
        })

        var get = Object.create(options)
        get.body = JSON.stringify({
          op: 'get',
          to: 'status:/account/name'
        })

        return fetch(endpoint, set).then(function (res) {
          expect(res.status).to.equal(200)

          return fetch(endpoint, get)
        }).then(function (res) {
          expect(res.status).to.equal(200)
          return res.json()
        }).then(function (body) {
          expect(body).to.deep.equal({
            op: 'get',
            to: 'status:/account/name',
            value: {
              '123': value
            }
          })
        })
      })
    })
  })

  describe('GET with querystring', function () {
    beforeEach(function () {
      options.method = 'GET'
      delete options.body
    })
    it('Presence get', function () {
      var url = endpoint + '?' + qs.stringify({
        to: 'presence:/account/ticket/1'
      })
      return fetch(url, options).then(function (res) {
        expect(res.status).to.equal(200)
        return res.json()
      }).then(function (body) {
        expect(body).to.deep.equal({
          op: 'get',
          to: 'presence:/account/ticket/1',
          value: {}
        })
      })
    })
    it('Status get', function () {
      var url = endpoint + '?' + qs.stringify({
        to: 'status:/account/ticket/1'
      })
      return fetch(url, options).then(function (res) {
        expect(res.status).to.equal(200)
        return res.json()
      }).then(function (body) {
        expect(body).to.deep.equal({
          op: 'get',
          to: 'status:/account/ticket/1',
          value: {}
        })
      })
    })
  })
})
