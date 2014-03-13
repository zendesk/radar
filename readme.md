## Documentation

See http://radar.zendesk.com/ for detailed documentation.

[![Build Status](https://travis-ci.org/zendesk/radar.png?branch=master)](https://travis-ci.org/zendesk/radar)

## Installation

Installing from scratch:

- Install and start Redis
- Install a 0.10.x or better branch of Node, look in http://nodejs.org/dist/
- git clone git@github.com:zendesk/radar.git
- npm install
- npm start

Installing from NPM:

- Install and start redis
- Install a 0.10.x or better branch of Node, look in http://nodejs.org/dist/
- npm init
- npm install --save radar
- create a file called index.js with the contents:
```
  var http = require('http');
  var Radar = require('radar').server;
  var Api = require('radar').api;

  var httpServer = http.createServer(function(req, res) {
    res.end('Nothing here.');
  });

  // Radar API
  Api.attach(httpServer);

  // Radar server
  var radar = new Radar();
  radar.attach(httpServer, { redis_host: 'localhost', redis_port: 6379 });

  httpServer.listen(8000);
```
- node index.js

## Copyright and License

Copyright 2012, Zendesk Inc.
Licensed under the Apache License Version 2.0, http://www.apache.org/licenses/LICENSE-2.0
