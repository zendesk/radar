var http = require('http'),
    configuration = require('./configuration.js'),
    Radar = require('./server/server.js'),
    Minilog = require('minilog');

var server;

// configure log output
Minilog.pipe(Minilog.suggest.deny(/.*/, (process.env.radar_log ? process.env.radar_log : 'debug')))
    .pipe(Minilog.backends.nodeConsole.formatWithStack)
    .pipe(Minilog.backends.nodeConsole);

function p404(req, res){
  console.log('Returning Error 404 for '+req.method+' '+req.url);
  res.statusCode = 404;
  res.end('404 Not Found');
}

server = http.createServer(p404);

// Radar server
var radar = new Radar();
radar.attach(server, configuration);

server.listen(configuration.port);
