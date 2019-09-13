/* globals describe, it, beforeEach, afterEach, gc */
var common = require('./common.js')
var chai = require('chai')
var expect = chai.expect
var EventEmitter = require('events').EventEmitter

describe('given a server', function () {
  var radarServer

  beforeEach(function (done) {
    radarServer = common.createRadarServer(done)
  })

  afterEach(function (done) {
    radarServer.terminate(done)
  })

  if (typeof gc === 'function') {
    var progress = require('smooth-progress')

    it('should not leak memory when clients connect and disconnect', function (done) {
      this.timeout(0)
      var totalConnections = 100000
      var concurrentConnections = 10000
      var thresholdBytes = 1024 * 1024
      var sockets = []
      var socketsHighWater = 0
      var ended = false
      var endedConnections = 0

      // make sockets
      var s = 0
      function makeSocket () {
        var socket = new EventEmitter()
        socket.id = s++
        return socket
      }
      function socketConnect () {
        var socket = makeSocket()
        sockets.push(socket)
        socketsHighWater = Math.max(sockets.length, socketsHighWater)
        radarServer._onSocketConnection(socket)
      }

      function checkEnd () {
        if (endedConnections === totalConnections && !ended) {
          ended = true
          gc()
          setTimeout(function () {
            gc()
            var end = process.memoryUsage().heapUsed
            console.log('Simulated', i.toLocaleString(), 'client connections, and saw max ', socketsHighWater.toLocaleString(), 'concurrent connections')
            var growth = end - start
            console.log('Heap growth', growth.toLocaleString(), 'bytes')
            expect(end - start).to.be.lessThan(thresholdBytes)
            done()
          }, 500)
        }
      }

      var bar = progress({
        tmpl: 'Simulating ' + totalConnections.toLocaleString() + ' connections... :bar :percent :eta',
        width: 25,
        total: totalConnections
      })
      bar.last = 0
      bar.i = setInterval(function () {
        bar.tick(endedConnections - bar.last)
        bar.last = endedConnections
        if (endedConnections === totalConnections) { clearInterval(bar.i) }
      }, 100)

      gc()
      var start = process.memoryUsage().heapUsed
      var i = 0
      asyncWhile(function () { return i < totalConnections }, function () {
        // limit concurrent
        if (sockets.length >= concurrentConnections || i === totalConnections) {
          var socket = sockets.pop()
          socket && socket.emit('close')
          endedConnections++
        } else {
          i++
          socketConnect()
        }
      }, function () {
        // close remaining open sockets
        while (sockets.length) {
          var socket = sockets.pop()
          socket && socket.emit('close')
          endedConnections++
        }
        checkEnd()
      })
    })
  } else {
    it('skipping memory leak test, run with node --expose-gc node flag to enable test')
  }
})

function asyncWhile (conditionPredicate, bodyFn, callbackFn) {
  setImmediate(function () {
    if (!conditionPredicate()) { return callbackFn() }
    bodyFn()
    asyncWhile(conditionPredicate, bodyFn, callbackFn)
  })
}
