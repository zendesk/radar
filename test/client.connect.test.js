/* globals describe, it, afterEach, before, after */
const common = require('./common.js')
const assert = require('assert')
const Tracker = require('callback_tracker')
let radar
let client

describe('Once radar server is running', function () {
  before(function (done) {
    const track = Tracker.create('before', done)

    radar = common.spawnRadar()
    radar.sendCommand('start', common.configuration, function () {
      client = common.getClient('dev', 123, 0, {}, track('client 1 ready'))
    })
  })

  afterEach(function () {
    client.dealloc('test')
  })

  after(function (done) {
    common.stopRadar(radar, done)
  })

  it('a client can nameSync successfully with ack', function (done) {
    const association = { id: 1, name: 'test_name' }
    const options = { association: association, clientVersion: '1.0.0' }

    client.control('test').nameSync(options, function (msg) {
      assert.strictEqual('nameSync', msg.op)
      assert.strictEqual('control:/dev/test', msg.to)
      done()
    })
  })
})
