/* globals describe, it, beforeEach, afterEach, gc */
const common = require('./common.js')
const chai = require('chai')
const expect = chai.expect
const EventEmitter = require('events').EventEmitter

describe('given a server', function () {
  let radarServer

  beforeEach(function (done) {
    radarServer = common.createRadarServer(done)
  })

  afterEach(function (done) {
    radarServer.terminate(done)
  })

  if (typeof gc === 'function') {
    const progress = require('smooth-progress')

    it('should not leak memory when clients connect and disconnect', function (done) {
      this.timeout(0)
      const totalConnections = 100000
      const concurrentConnections = 10000
      const thresholdBytes = 1024 * 1024
      const sockets = []
      let socketsHighWater = 0
      let ended = false
      let endedConnections = 0

      // make sockets
      let s = 0
      function makeSocket () {
        const socket = new EventEmitter()
        socket.id = s++
        return socket
      }
      function socketConnect () {
        const socket = makeSocket()
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
            const end = process.memoryUsage().heapUsed
            console.log('Simulated', i.toLocaleString(), 'client connections, and saw max ', socketsHighWater.toLocaleString(), 'concurrent connections')
            const growth = end - start
            console.log('Heap growth', growth.toLocaleString(), 'bytes')
            expect(end - start).to.be.lessThan(thresholdBytes)
            done()
          }, 500)
        }
      }

      const bar = progress({
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
          const socket = sockets.pop()
          socket && socket.emit('close')
          endedConnections++
        } else {
          i++
          socketConnect()
        }
      }, function () {
        // close remaining open sockets
        while (sockets.length) {
          const socket = sockets.pop()
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
