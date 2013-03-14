# radar

## High level API and backend for writing web apps that use push messaging

### Features

- more than just pub/sub: a resource-based API for presence, messaging and push notifications via a Javascript client library
- REST API for working with web apps that don't use Node
- written in Javascript/Node.js, and uses engine.io (the new, lower-level complement to socket.io)
- backend which can utilize to multiple front-facing servers to serve requests.

## What is Radar and how is it different from (Socket.io|Sockjs|Faye|Meteor)?

Radar is built on top of [Engine.io](https://github.com/learnboost/engine.io), the next generation backend for Socket.io. It uses Redis for backend storage, though the assumption is that this is only for storing currently active data.

Radar basically solves a number of real-world problems that need to solved, and it reduces the need for specialized backend services by providing good primitive operations.


- Radar has higher level APIs that cover basic use cases such as presence, persisted message channels. Many push notification frameworks only expose message passing and do not explicitly handle having multiple backend servers, leaving the implementation for their users. Radar provides higher level constructs, so that you are for example:
  - subscribing to notifications about a user going online/offline
  - subscribing to notifications about changes to a shared variable in a database
  - sending messages to a channel

  ... rather than just passing messages. More complex systems can be built by combining the Radar API resources.
- REST API for interacting with Radar resources from non-Node web frameworks.
- Configurable authentication for resources. You can restrict access based on a token.
- Robust recovery. Radar takes care of re-establishing subscriptions in the event of a server error. Other frameworks can recover a connection, but not the application-level subscriptions and state.
- Multi-server support via shared Redis instance. Add capacity by adding new server instances behind a load balancer.
- Persistence. Messages can be stored (for long-ish terms) in the backend. For example, you might want to be able to send recent messages to new users joining a chat - this can be configured via a policy.
- Library, not a framework. Doesn't require code changes or structural changes beyond responding to the events from the backend.

## Quickstart: let's write a Radar application

This tutorial will walk you through the process of implementing a chat server using Radar. The source code to a full example is also bundled in the radar (server) repository under `./sample`.

### 1. Setting up the server

Let's start by getting the Radar server up and running.

Create a `package.json` file by running `npm init` for your new project; then run `npm install --save radar`. This installs the Radar server library and also adds the dependency to the `package.json` file.

Now, let's require the Radar server library and attach it to a HTTP server:

    var http = require('http'),
        Radar = require('radar').server;

    var server = http.createServer(function(req, res) {
      console.log('404', req.url);
      res.statusCode = 404;
      res.end();
    });

    // attach Radar server to the http server
    Radar.attach(server, {
      redis_host: 'localhost',
      redis_port: 6379
    });

    server.listen(8000);
    console.log('Server listening on localhost:8000');

Note that you need to have Redis running for Radar to work. Save this as "server.js" and run it with "node server.js".

### 2. Setting up the client

First, add the radar client to our package.json:

    npm install --save radar_client

The Radar client has two dependencies:

- [engine.io-client](https://github.com/LearnBoost/engine.io-client): since Radar uses engine.io internally, it needs the client file to be available
- [minilog](http://mixu.net/minilog/): Radar logs events on the client side using Minilog; that's mostly just because I wanted a logger that works on both the client and the server and is small (~80 lines)

There are many ways in which you could include these dependencies:

- you can just copy the distribution files from ./dist/ for the dependencies and make sure they are included on the page before the Radar client (e.g. with regular script tags)
- you can create a single file that you can distribute

The first one is probably easy to figure out, so let's do the second one. Here is a `Makefile` that does that:

    build:
      @echo 'Building public/radar_client.js'
      @mkdir -p public
      @cat ./node_modules/radar_client/node_modules/minilog/dist/minilog.js > public/radar_client.js
      @cat ./node_modules/radar_client/node_modules/engine.io-client/dist/engine.io.js >> public/radar_client.js
      @cat ./node_modules/radar_client/dist/radar_client.js >> public/radar_client.js
      # uncomment if you want to use uglifyJS to further minify the file @uglifyjs --overwrite public/radar_client.js
      @echo 'Wrote public/radar_client.js'

    .PHONY: build

Note that GNU make requires that you use tabs for indentation and it will not be helpful in telling you to that.

### 3. Putting the two together

...

# Radar client

Read the [client docs](client.html) for the details.

# Radar server

Read the [server docs](server.html) for the details.

# REST API

Read the [REST API docs](rest.html) for the details.

## Copyright and License

Radar is Copyright 2012, Zendesk Inc.

Licensed under the Apache License Version 2.0, http://www.apache.org/licenses/LICENSE-2.0

