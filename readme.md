## Radar

High level API and backend for writing web apps that use real-time information.

## Documentation

See http://radar.zendesk.com/index.html for detailed documentation.

[![Build Status](https://travis-ci.org/zendesk/radar.png?branch=master)](https://travis-ci.org/zendesk/radar)

## Installation

###Installing from scratch:

- Install and start Redis
- Install a 0.10.x or better branch of Node, look in http://nodejs.org/dist/
- git clone git@github.com:zendesk/radar.git
- npm install
- npm start

###Installing from NPM:

- Install and start redis
- Install a 0.10.x or better branch of Node, look in http://nodejs.org/dist/
- npm init
- npm install --save radar
- create a file called server.js with the contents:
```
  var http = require('http');
  var Radar = require('radar').server;

  var httpServer = http.createServer(function(req, res) {
    res.end('Nothing here.');
  });

  // Radar server
  var radar = new Radar();
  radar.attach(httpServer, { redis_host: 'localhost', redis_port: 6379 });

  httpServer.listen(8000);
```
- node server.js

## Running tests

By default, when running `npm test`, tests are ran only against sentinel. 

If you want to run against redis directly, you should execute: `npm run test-redis` or `npm run test-full` to 
run against redis and sentinel (longer). 

## How to contribute

- Fork http://github.com/zendesk/radar, clone, make changes (including a Changelog update), commit, push, PR

## Copyright and License

Copyright 2015, Zendesk Inc.
Licensed under the Apache License Version 2.0, http://www.apache.org/licenses/LICENSE-2.0 
