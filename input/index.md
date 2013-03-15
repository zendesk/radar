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

    var fs = require('fs'),
        url = require('url'),
        http = require('http'),
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

To generate the build, run `make build`.

### 3. Putting the two together

Let's set up the server to serve the files, and a minimal HTML page that initializes the Radar client.

Rather than building anything more complicated like a UI, let's just take advantage of the developer console that all good modern browsers have to create a chat. Create the following `public/index.html`:

    <!doctype html>
    <html>
      <head>
        <title>Test</title>
        <script src="/radar_client.js"></script>
    <script>
    Minilog.enable();
    RadarClient.configure({
      host: window.location.hostname,
      port: 8000,

      userId: Math.floor(Math.random()*100),
      userType: 0,
      accountName: 'dev'
    });
    </script>
      </head>
      <body>
        <p>Open the developer console...</p>
      </body>
    </html>

Also add support for serving the two files we created earlier, changing the server's HTTP request handler to:

    var server = http.createServer(function(req, res) {
      var pathname = url.parse(req.url).pathname;

      if(/^\/radar_client.js$/.test(pathname)) {
        res.setHeader('content-type', 'text/javascript');
        res.end(fs.readFileSync('./public/radar_client.js'));
      } else if(pathname == '/') {
        res.setHeader('content-type', 'text/html');
        res.end(fs.readFileSync('./public/index.html'));
      } else {
        console.log('404', req.url);
        res.statusCode = 404;
        res.end();
      }
    });

Open up http://localhost:8000/ in your browser and open the developer console.

### 4. What's in the Radar client configuration?

If you looked at the code in index.html, we're doing two function calls: one, to `Minilog.enable()` which turns on all logging - which includes Radar's internal logging. The other one is to `RadarClient.configure()`, which configured the host and the port of the Radar server - and three other important pieces of infomation.

Those are:

- userId: any number that uniquely identifies a user
- userType: any number that represents a user type
- accountName: any string

Every user needs to have a account, a user id and a user type. The reason is basically that Radar was initially built for Zendesk's use and every Zendesk user has that information (and more). But most other applications will have the same constructs, so there was no point in getting rid of these fields when we open sourced Radar.

These are just arbitrary pieces of information, which you can manage in any way you want to. There is no "user management" in Radar and Radar doesn't care about what values you use, you just need to pick some values. Sometimes these values are used for key names - for example, all Radar data in Redis contains the account name in as a part of the key so you can examine data for a specific account. Feel free to figure out what makes sense for your application.

OK, with that, let's get started.

### 5. Using alloc() to connect

First, let's connect to the server by calling `.alloc`. Copy-paste this into your developer console after loading the page from localhost:

    RadarClient.alloc('example', function() {  console.log('Radar is ready'); });

`alloc(scopename, [callback])` is used to connect to the server. The scope name ("example") is just a name for the functionality you are using. The nice part is that if you have an app consisting of multiple independent features that use Radar, they can each uniquely identify themselves as either needing a Radar connection or not needing a Radar connection (via `.dealloc(scopename)`).

So the connection is initialized the first time you call `.alloc()` - any duplicate calls will just use the existing connection rather than creating more connections. And the connection is only disconnected when all of the names passed to `alloc` have made a corresponding `dealloc` call.

The callback is called when the connection is established (if the connection is already there, then it is called immediately).

If you look at the developer console, you'll see a bunch of log statements when you run that (because we called `Minilog.enable()` earlier), such as:

    radar_state debug {"op":"run-state","state":6}
    Radar is ready
    radar_client info {"server":"mxdeb","cid":"OxJPb4OKXV6ua4saAAAA","direction":"in"}

Here you can see that the Radar client is now in state 6 - which, for the internal state machine, means it's ready.

The callback runs, and you also receive back a message with the hostname of the server you're on and the randomly generated client id for this Radar session.

### 6. Creating a chat

What is chat? It's a history of messages, and information about who is online.

We'll use a presence scope to track people going online and offline, and a message scope to store a channel of messages.

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

