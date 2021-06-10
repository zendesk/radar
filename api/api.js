const hostname = require('os').hostname()
const Router = require('./lib/router.js')
const RadarApi = require('./apis/radar.js')

const api = new Router()

function homepage (req, res) {
  res.setHeader('Content-Type', 'text/plain') // IE will otherwise try to save the response instead of just showing it
  res.end(JSON.stringify({ pong: 'Radar running at ' + hostname }))
}

// Monitor API

api.get(/^(\/ping)?\/?$/, homepage)
api.get(/^\/engine.io\/ping.*$/, homepage)

// Radar API

api.post(/^\/radar\/status/, RadarApi.setStatus)
api.get(/^\/radar\/status/, RadarApi.getStatus)
api.post(/^\/radar\/message/, RadarApi.setMessage)
api.get(/^\/radar\/message/, RadarApi.getMessage)
api.get(/^\/radar\/presence(.*)/, RadarApi.getPresence)

module.exports = api
