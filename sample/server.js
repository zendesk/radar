var fs = require('fs'),
    url = require('url'),
    http = require('http'),

    Minilog = require('minilog'),
    Radar = require('../index.js').server;
    Router = require('../api/lib/router.js');

var server = http.createServer(function(req, res) {
  console.log('404', req.url);
  res.statusCode = 404;
  res.end();
});

var routes = new Router();

routes.get(new RegExp('^/$'), function(req, res) {
  res.end(fs.readFileSync('./index.html').toString().replace('%user_id%', Math.floor(Math.random() * 100000)));
});

routes.get(new RegExp('^/user/(.*)$'), function(req, res, re) {
  res.end(fs.readFileSync('./index.html').toString().replace('%user_id%', re[1]));
});

routes.get(new RegExp('^/minilog.js$'), function(req, res) {
  res.setHeader('content-type', 'text/javascript');
  res.end(fs.readFileSync('../node_modules/minilog/dist/minilog.js'));
});

routes.get(new RegExp('^/radar_client.js$'), function(req, res) {
  res.setHeader('content-type', 'text/javascript');
  res.end(fs.readFileSync('../node_modules/radar_client/dist/radar_client.js'));
});

routes.get(new RegExp('^/engine.io.js$'), function(req, res) {
  res.setHeader('content-type', 'text/javascript');
  res.end(fs.readFileSync('./engine.io.js'));
});

routes.get(new RegExp('^/css/style.css$'), function(req, res) {
  res.end(fs.readFileSync('./css/style.css'));
});

routes.get(new RegExp('^/views.js$'), function(req, res) {
  res.setHeader('content-type', 'text/javascript');
  res.end(fs.readFileSync('./views.js'));
});

Minilog.pipe(Minilog.backends.nodeConsole.formatWithStack)
  .pipe(Minilog.backends.nodeConsole);


routes.attach(server);
new Radar().attach(server, require('../configuration.js'));

server.listen(8080);

console.log('Server listening on localhost:8080');
