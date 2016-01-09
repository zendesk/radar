## radar

The real-time service layer for your web application

[![Build Status](https://travis-ci.org/zendesk/radar.svg?branch=master)](https://travis-ci.org/zendesk/radar)
[![Dependency Status](https://david-dm.org/zendesk/radar.svg)](https://david-dm.org/zendesk/radar)
[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg)](http://standardjs.com/)


## Documentation

See [radar.zendesk.com](http://radar.zendesk.com) for detailed documentation.

This is the project necessary for running a radar server. Documentation about building an app and using the client-side libraries is available at [radar.zendesk.com](http://radar.zendesk.com). Browse [radar client libraries and tools](https://github.com/zendesk?utf8=%E2%9C%93&query=radar).

## Installation
Requires: redis 2.8+, node.js 0.10+

###Installing from npm:

```sh
$ npm install radar
```


### Programmatic usage
radar can be extended programmatically with custom code and middleware:

```js
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

See also the [`sample`](https://github.com/zendesk/radar/tree/master/sample) directory in the `radar` repository.


### Out-of-the-box usage
```sh
$ git clone git@github.com:zendesk/radar.git
$ cd radar
$ npm install
$ npm start
```

*See [radar.zendesk.com/server](http://radar.zendesk.com/server) for additional usage and configuration documentation* 

## Contributing

## Running tests
```sh
$ npm test
```

By default, tests are run only against redis sentinel. 

If you want to run against redis directly: `$ npm run test-redis` 
For direct redis and redis sentinel: `$ npm run test-full`


## Workflow

- Fork http://github.com/zendesk/radar, clone, make changes (including a Changelog update), commit, push, PR


## Copyright and License

Copyright 2016, Zendesk Inc.
Licensed under the Apache License Version 2.0, http://www.apache.org/licenses/LICENSE-2.0
