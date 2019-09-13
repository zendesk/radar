/* globals describe, it, beforeEach, afterEach */
var common = require('./common.js')
var assert = require('assert')
var controlMessage = {
  to: 'control:/dev/test',
  op: 'ctl',
  options: {
    association: {
      id: 1,
      name: 1
    }
  }
}
var radarServer
var socket

describe('given a server with filters', function () {
  beforeEach(function (done) {
    radarServer = common.createRadarServer(done)
    socket = { id: 1 }
  })

  afterEach(function (done) {
    radarServer.terminate(done)
  })

  describe('with no filters', function () {
    it('should not halt execution', function (done) {
      radarServer._handleResourceMessage = function () {
        done()
      }
      radarServer._processMessage(null, controlMessage)
    })
  })

  describe('with 1 filter', function () {
    it('if OK, it should run it and continue', function (done) {
      var called = false

      radarServer._handleResourceMessage = function () {
        assert.ok(called)
        done()
      }

      radarServer.use({
        onMessage: function (client, message, options, next) {
          called = true
          assert.strictEqual(client.id, socket.id)
          assert.strictEqual(options.type, 'Control')
          assert.deepStrictEqual(message, controlMessage)
          next()
        }
      })

      radarServer._processMessage(socket, controlMessage)
    })

    it('if NOT OK, it should run it and halt', function (done) {
      var called = false

      socket.send = function (message) {
        assert.strictEqual('err', message.op)
        assert(called)
        done()
      }

      radarServer.use({
        onMessage: function (client, message, options, next) {
          called = true
          assert.strictEqual(options.type, 'Control')
          socket.send({ op: 'err' })
          next('err')
        }
      })

      radarServer._processMessage(socket, controlMessage)
    })
  })

  describe('with multiple filters', function () {
    it('should respect order', function (done) {
      var onMessagevious

      socket.send = function (value) {
        if (value === 1) {
          onMessagevious = value
        } else if (value === 2) {
          assert.strictEqual(onMessagevious, 1)
          done()
        }
      }

      var firstFilter = {
        onMessage: function (client, message, options, next) {
          client.send(1)
          next()
        }
      }

      var secondFilter = {
        onMessage: function (client, message, options, next) {
          client.send(2)
          next()
        }
      }

      radarServer.use(firstFilter)
      radarServer.use(secondFilter)

      radarServer._processMessage(socket, controlMessage)
    })
  })
})
