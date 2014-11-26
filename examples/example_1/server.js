var fs = require('fs'),
    url = require('url'),
    http = require('http'),
    Radar = require('radar').server;

var server = http.createServer(function(req, res) {
  console.log('404', req.url);
  res.statusCode = 404;
  res.end('404 page');
});

// attach Radar server to the http server
var radar = new Radar();

var configuration = {
  redis_host: 'localhost',
  redis_port: 6379,
  port: 8000
};

radar.attach(server, configuration);

server.listen(configuration.port);
console.log('Server listening on localhost:', configuration.port);
