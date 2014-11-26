var fs = require('fs'),
    url = require('url'),
    http = require('http'),
    Radar = require('radar').server;

var server = http.createServer(function(req, res) {
  var pathname = url.parse(req.url).pathname;

  if (/^\/radar_client.js$/.test(pathname)) {
    res.setHeader('content-type', 'text/javascript');
    res.end(fs.readFileSync('./public/radar_client.js'));
  } else if (pathname == '/') {
    res.setHeader('content-type', 'text/html');
    res.end(fs.readFileSync('./public/index.html'));
  } else {
    console.log('404', req.url);
    res.statusCode = 404;
    res.end('404 page');
  }
});

// Type entry for message history
var Type = require('radar').core.Type;

Type.register('chatMessage', {
  expr: new RegExp('^message:/.+/chat/.+$'),
  type: 'MessageList',
  policy: { cache: true, maxCount: 300 }
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
