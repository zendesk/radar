var fs = require('fs'),
    url = require('url'),
    http = require('http'),

    Router = require('../api/lib/router.js');

var server = http.createServer(function(req, res) {
  console.log('404', req.url);
  res.statusCode = 404;
  res.end();
});

var routes = new Router();

routes.get(new RegExp('^/$'), function(req, res) {
  res.end(fs.readFileSync('./index.html'));
});

routes.get(new RegExp('^/user/(.*)$'), function(req, res, re) {
  res.end(fs.readFileSync('./index.html').toString().replace('%user_id%', re[1]));
});

routes.get(new RegExp('^/miniee.js$'), function(req, res) {
  res.setHeader('content-type', 'text/javascript');
  res.end(fs.readFileSync('../node_modules/miniee/dist/miniee.js'));
});

routes.get(new RegExp('^/stalker.js$'), function(req, res) {
  res.setHeader('content-type', 'text/javascript');
  res.end(fs.readFileSync('../client/dist/stalker.js'));
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


routes.attach(server);
server.listen(9000);
