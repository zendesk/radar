var hostname = require('os').hostname(),
    Router = require('./lib/router.js'),
    RadarApi = require('./apis/radar.js');

var api = new Router();

function homepage(req, res) {
  res.setHeader('Content-Type', 'text/plain'); // IE will otherwise try to save the response instead of just showing it.
  res.end(JSON.stringify({ pong: 'Radar running at '+hostname }));
}

// Monitor API

api.get(/^(\/ping)?\/?$/, homepage);
api.get(/^\/engine.io\/ping.*$/, homepage);

// Radar API

api.post(new RegExp('^/radar/status'), RadarApi.setStatus);
api.get(new RegExp('^/radar/status'), RadarApi.getStatus);
api.post(new RegExp('^/radar/message'), RadarApi.setMessage);
api.get(new RegExp('^/radar/message'), RadarApi.getMessage);
api.get(new RegExp('^/radar/presence(.*)'), RadarApi.getPresence);

module.exports = api;
