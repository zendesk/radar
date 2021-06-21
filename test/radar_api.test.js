const http = require('http')
const assert = require('assert')
const Api = require('../api/api.js')
const ClientScope = require('../api/lib/client')
const Persistence = require('../src/core').Persistence
const PresenceManager = require('../src/core').PresenceManager
const Presence = require('../src/core').Presence
const Type = require('../src/core').Type
const Status = require('../src/core').Status
const MessageList = require('../src/core').MessageList
const Common = require('./common.js')
let frontend

const originalSentry = Presence.sentry

const Client = new ClientScope({
  secure: false,
  host: 'localhost',
  port: 8123
})

exports['Radar api tests'] = {
  before: function (done) {
    Common.startPersistence(function () {
      // Create frontend server
      frontend = http.createServer(function (req, res) { res.end('404 error') })
      Api.attach(frontend)

      frontend.listen(8123, done)
    })
  },

  beforeEach: function (done) {
    Persistence.delWildCard('*', done)
  },

  after: function (done) {
    frontend.close()
    Common.endPersistence(done)
  },

  // GET /radar/status?accountName=test&scope=ticket/1
  'can get a status scope': function (done) {
    const to = 'status:/test/ticket/1'
    const opts = Type.getByExpression(to)
    const status = new Status(to, {}, opts)

    status.set({}, {
      key: 'foo',
      value: 'bar'
    })

    Client.get('/node/radar/status')
      .data({ accountName: 'test', scope: 'ticket/1' })
      .end(function (err, response) {
        if (err) { return done(err) }
        assert.deepStrictEqual({ foo: 'bar' }, response)
        Persistence.ttl('status:/test/ticket/1', function (err, reply) {
          if (err) { return done(err) }
          assert.ok((parseInt(reply, 10) > 0))
          done()
        })
      })
  },

  // POST /radar/status { accountName: 'test', scope: 'ticket/1' }
  'can set a status scope': function (done) {
    Client.post('/node/radar/status')
      .data({ accountName: 'test', scope: 'ticket/2', key: 'foo', value: 'bar' })
      .end(function (err, response) {
        if (err) { return done(err) }
        assert.deepStrictEqual({}, response)

        Client.get('/node/radar/status')
          .data({ accountName: 'test', scope: 'ticket/2' })
          .end(function (err, response) {
            if (err) { return done(err) }
            assert.deepStrictEqual({ foo: 'bar' }, response)
            Persistence.ttl('status:/test/ticket/2', function (err, reply) {
              if (err) { return done(err) }
              assert.ok((parseInt(reply, 10) > 0))
              done()
            })
          })
      })
  },

  // GET /radar/message?accountName=test&scope=chat/1
  'can get a message scope': function (done) {
    const messageType = {
      expr: /^message:\/setStatus\/(.+)$/,
      type: 'message',
      authProvider: false,
      policy: { cache: true, maxAgeSeconds: 30 }
    }

    Type.register('message', messageType)

    const to = 'message:/setStatus/chat/1'
    const opts = Type.getByExpression(to)
    const msgList = new MessageList(to, {}, opts)

    msgList.publish({}, {
      key: 'foo',
      value: 'bar'
    })

    Client.get('/node/radar/message')
      .data({ accountName: 'setStatus', scope: 'chat/1' })
      .end(function (error, response) {
        if (error) { return done(error) }
        assert.deepStrictEqual({ key: 'foo', value: 'bar' }, JSON.parse(response[0]))
        done()
      })
  },

  // POST /radar/message { accountName:'test', scope:'ticket/1' }
  'can set a message scope': function (done) {
    const messageType = {
      expr: /^message:\/setStatus\/(.+)$/,
      type: 'MessageList',
      authProvider: false,
      policy: {
        cache: true,
        maxAgeSeconds: 300
      }
    }

    Type.register('message', messageType)

    Client.post('/node/radar/message')
      .data({ accountName: 'setStatus', scope: 'chat/2', value: 'hello' })
      .end(function (error, response) {
        if (error) { return done(error) }
        assert.deepStrictEqual({}, response)

        Client.get('/node/radar/message')
          .data({ accountName: 'setStatus', scope: 'chat/2' })
          .end(function (error, response) {
            if (error) { return done(error) }
            assert.deepStrictEqual('hello', JSON.parse(response[0]).value)
            Persistence.ttl('message:/setStatus/chat/2', function (err, reply) {
              if (err) { return done(err) }
              assert.ok((parseInt(reply, 10) > 0))
              done()
            })
          })
      })
  },

  'given a fake PresenceMonitor': {
    before: function (done) {
      function FakePersistence () {}

      const messages = {
        'presence:/test/ticket/1': {
          '1.1000': {
            userId: 1,
            userType: 0,
            clientId: 1000,
            online: true,
            sentry: 'server1'
          }
        },
        'presence:/test/ticket/2': {
          2.1001: {
            userId: 2,
            userType: 4,
            clientId: 1001,
            online: true,
            sentry: 'server1'
          }
        }
      }

      FakePersistence.readHashAll = function (scope, callbackFn) {
        callbackFn(messages[scope])
      }

      FakePersistence.deleteHash = function (scope, callbackFn) {}

      PresenceManager.setBackend(FakePersistence)
      const fakeSentry = {
        name: 'server1',
        isDown: function () {
          return false
        },
        on: function () {}
      }

      Presence.sentry = fakeSentry
      done()
    },

    after: function (done) {
      PresenceManager.setBackend(Persistence)
      Presence.sentry = originalSentry
      done()
    },

    // GET /radar/presence?accountName=support&scope=ticket/1
    'can get a presence scope using api v1': function (done) {
      Client.get('/node/radar/presence')
        .data({ accountName: 'test', scope: 'ticket/1' })
        .end(function (error, response) {
          if (error) { return done(error) }
          assert.deepStrictEqual({ 1: 0 }, response)
          done()
        })
    },

    'can get multiple presence scopes using api v1': function (done) {
      Client.get('/node/radar/presence')
        .data({ accountName: 'test', scopes: 'ticket/1,ticket/2' })
        .end(function (error, response) {
          if (error) { return done(error) }
          assert.deepStrictEqual({ 'ticket/1': { 1: 0 }, 'ticket/2': { 2: 4 } }, response)
          done()
        })
    },

    'can get a presence scope with client ids using api v2': function (done) {
      Client.get('/node/radar/presence')
        .data({ accountName: 'test', scope: 'ticket/1', version: 2 })
        .end(function (error, response) {
          if (error) { return done(error) }
          assert.deepStrictEqual({ 1: { clients: { 1000: {} }, userType: 0 } }, response)
          done()
        })
    },

    'can get multiple presence scopes using api v2': function (done) {
      Client.get('/node/radar/presence')
        .data({ accountName: 'test', scopes: 'ticket/1,ticket/2', version: 2 })
        .end(function (error, response) {
          if (error) { return done(error) }
          assert.deepStrictEqual({ 'ticket/1': { 1: { clients: { 1000: {} }, userType: 0 } }, 'ticket/2': { 2: { clients: { 1001: {} }, userType: 4 } } }, response)
          done()
        })
    }
  }
}
