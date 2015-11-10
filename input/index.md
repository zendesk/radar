# Radar

## The real-time service layer for your web application

### Unique Features
- High-availability and horizontally scalable Node.js server for real-world production environments
- Built on engine.io for robust browser support
- Resource-based modelling primitives for presence, messaging and push notifications

## What is Radar and how is it different from (Socket.io|Sockjs|Faye|Meteor)?

Radar provides real-time primitives for building production-ready applications.

Radar is built on top of [Engine.io](https://github.com/learnboost/engine.io), the next-generation backend for Socket.io. It uses Redis (with Sentinel cluster support) for efficient and reliable pub/sub message distribution.

- Radar has high-level APIs that cover basic use cases such as presence and persisted message channels. Many push notification frameworks only expose message passing and do not explicitly handle having multiple backend servers, leaving the implementation for their users. Radar provides high-level constructs, so that you are for example:
  - subscribing to notifications about a user going online/offline
  - subscribing to notifications about changes to a shared variable in a database
  - sending messages to a channel

  ... rather than just passing messages. More complex systems can be built by combining the Radar API resources.
- REST API for interacting with Radar resources from non-Node web frameworks.
- Configurable authentication for resources. You can restrict access based on a token.
- Robust recovery. Radar takes care of re-establishing subscriptions in the event of a server error. Other frameworks can recover a connection, but not the application-level subscriptions and state.
- Multi-server support via shared Redis instance. Add capacity by adding new server instances behind a load balancer.
- Persistence. Messages can be stored (for long-ish terms) in the backend. For example, you might want to send recent messages to new users joining a chat - this can be configured via a policy.
- Library, not a framework. Doesn't require code changes or structural changes beyond responding to the events from the backend.

## Tutorial: let's write a Radar application

This tutorial will walk you through the process of implementing a chat server using Radar. You can also find another example application bundled in the radar (server) repository under `./sample`, which uses Radar to present a UI.

The example source code used below (except that which you enter in the javascript console of your browser) is available in the <a href="https://github.com/zendesk/radar/tree/gh-pages/examples" target="_blank">Example source code on Github</a>.

### 1. Setting up the server

Let's start by getting the Radar server up and running.

Create a `package.json` file by running `npm init` for your new project; then run `npm install --save radar`. This installs the Radar server library and also adds the dependency to the `package.json` file.

Now, let's require the Radar server library and attach it to a HTTP server:

```js
var http = require('http'),
    Radar = require('radar'),
    config = Radar.configurator.load({persistence: true});

// create an HttpServer instance
var server = http.createServer(function(req, res) {
  console.log('404', req.url);
  res.statusCode = 404;
  res.end();
});

// attach Radar server to the HttpServer
var radar = new Radar.server();

radar.attach(server, config);
console.log(config)
server.listen(config.port, function () {
  console.log('Server listening on localhost:' + config.port);  
});
```

Note that Redis must be running for Radar to work. Save this as `server.js` and run it with `node server.js`.

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

Rather than building anything more complicated like a UI, let's just take advantage of the developer console that all good modern browsers have, and use that to create a chat. Create the following `public/index.html`:

```html
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
```

Also add support for serving the two files we created earlier, changing the server's HTTP request handler to:

```js
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
        res.end();
      }
    });
```

Open up [http://localhost:8000/](http://localhost:8000/) in your browser and open the developer console.

### 4. What's in the Radar client configuration?

The code in `index.html` contains two function calls:
-`Minilog.enable()`, which turns on all logging and includes Radar's internal logging
-`RadarClient.configure()`, which configures the host and the port of the Radar server - and three other important pieces of infomation:
  - `userId`: any number that uniquely identifies a user
  - `userType`: any number that represents a user type
  - `accountName`: any string

Every user needs an account, a user id and a user type. Radar was initially built for Zendesk's use and data for every Zendesk user has these fields (and more). It is likely that most other applications will have the same or similar constructs, so there was no point in getting rid of these fields once we open sourced Radar.

These fields represent business data, which you can manage any way you choose. There is no "user management" in Radar, and Radar doesn't care about the values you use. From Radar's perspective, these are opaque application-level data.  Sometimes these values are used for key names - for example, all Radar data in Redis contains the account name as a part of the key so you can identify data for a specific account. It's up to you to determine what makes sense for your application.

OK, with that, let's get started.

### 5. Using alloc() to connect

First, let's connect to the server by calling `alloc`. Copy-paste this into your developer console after loading the page from localhost:

    RadarClient.alloc('example', function() {  console.log('Radar is ready'); });

`alloc(scopename, [callback])` is used to connect to the server. The scope name ("example") is just a name for the functionality you are using. The nice part is that when you have an app consisting of multiple independent features that use Radar, each can each uniquely identify itself as either needing a Radar connection or not needing a Radar connection (via `.dealloc(scopename)`).

So the connection is initialized the first time you call `.alloc()` - any subsequent calls to `alloc` will use the existing connection rather than create a new one. Also, the connection is disconnected only when each name passed to `alloc` has made a corresponding `dealloc` call.

The callback is called when the connection is established (when the connection already exists, the callback is called immediately).  In our example, the callback is an anonymous function that sends 'Radar is ready' to the console log.

In the developer console, the call to `alloc` generates a number of log statements (logging is enabled by the call to `Minilog.enable()`) in `index.html`.

    radar_state event-state-connect, from: opened, to: connecting ["connect", "opened", "connecting"] radar_client.js:36
    radar_state before-connect, from: opened, to: connecting ["connect", "opened", "connecting"] radar_client.js:36
    Client {_ackCounter: 1, _channelSyncTimes: Object, _users: Object, _presences: Object, _subscriptions: Object…}
    radar_client socket open jTHdmJJUdvnYS6kKAAAA radar_client.js:36
    radar_state event-state-established, from: connecting, to: connected ["established", "connecting", "connected"] radar_client.js:36
    radar_state event-state-authenticate, from: connected, to: authenticating ["authenticate", "connected", "authenticating"] radar_client.js:36
    radar_state before-authenticate, from: connected, to: authenticating ["authenticate", "connected", "authenticating"] radar_client.js:36
    radar_state event-state-activate, from: authenticating, to: activated ["activate", "authenticating", "activated"] radar_client.js:36
    radar_state before-activate, from: authenticating, to: activated ["activate", "authenticating", "activated"] radar_client.js:36
    Radar is ready
    radar_client info {"server":"mxdeb","cid":"OxJPb4OKXV6ua4saAAAA","direction":"in"}

Here you can see that the Radar client transitions through the following states: **connecting**, **connected**, **authenticating**, and **activated**.

The callback runs, and you also receive back a message with the hostname of the server you're on and the randomly generated client id for this Radar session.

### 6. Creating a chat - message resource

What is chat? It's a history of messages, and information about who is online.

We'll use a **MessageList** resource to store a channel of messages, and a **Presence** resource to track people going online and offline.

Let's set that up by subscribing to a MessageList resource:

```js
    RadarClient.message('chat/1').on(function(message) {
      console.log('Chat:', message.value);
    }).sync();
```

If you run that you'll see something like this:

    Scope {prefix: "message:/dev/chat/1", client: Client, set: function, get: function, subscribe: function…}

So, there are two parts: the `.on()` handler, which is triggered when messages are received, and the `.sync()` call, which reads all the old messages from a message resource, and subscribes to any new messages on that channel. If there had been any messages on that channel, the message handler would have been triggered.

Now, let's send a message:

```js
    RadarClient.message('chat/1').publish('Hello world');
```

You should see the message echoed back to you, since your current session is subscribed to the "chat/1" message resource.

OK, open a second tab and keep it open. Run this code to initialize your second client session:

```js
    RadarClient.alloc('example', function() {
      RadarClient.message('chat/1').on(function(message) {
        console.log('Chat:', message.value);
      }).sync();
    });
```

Now, try sending another message via `.publish` - you should see the message arrive to both tabs.

### 7. Message history

Here is the cool part: you can run multiple Radar servers that use the same Redis server, and they just work.

When two or more clients are on different Radar servers, and those servers use the same backend Redis server, then messages will be routed correctly via Redis and, in conjuction with Radar, messages will be routed correctly to the listening clients. The only caveat is that you need source-IP sticky load balancing if you put a load balancer in front of Radar. The need for sticky load balancing is a limitation inherent in how client id-based transports work.

The ability to access message history is part of chat or any message channel application.

Radar has the ability to cache a configurable number of messages.  In the following example, the server is configured to store up to 300 messages for each connection. Note that this is configured through the **Type** system:

```js
    var Type = require('radar').core.Type;

    Type.register('chatMessage', {
        expr: new RegExp('^message:/.+/chat/(.+)$'),
        type: 'MessageList',
        policy: { cache: true, maxCount: 300 }
    });
```

Here, we're registering a new type of channel for any channel whose name matches the regular expression defined by `expr`. The `policy` key defines that the data should be cached - which is what we want so that messages are kept around; `maxCount` says that we will keep up to 300 messages (see the server docs for the other options).

Once you add the above code to `server.js` and then restart the server, you'll start to see that previously published messages are now synchronized back to your client. This makes it a lot easier to implement a chat with history. Since the persistence policy is determined via a RegExp, you can set different policies for different use cases.

### 8. Creating a chat - presence resource

At this point two users have joined a chat channel, and we have configured the caching policy to keep old messages around.

Another useful feature of a chat application is one that allows a given user to know when other users come online, are online, and go offline.  We call this feature **presence**.  An application can use Radar presence, in particular, to route messages to other users who have indicated they are interested in such messages.

Radar has a presence resource type that is built specifically to track users who are online - that's the purpose of the `userId` information in the original client configuration in `index.html`.

In the example below, the `sync` method directs Radar to send the client up to `maxCount` messages, and in addition, **subscribes** the client to all future messages on this channel.  Note also that we are interested only in the **online** and **offline** messages and not, for example, in the **client_online** or **client_offline** messages.

First, let's run this piece of code in each of the tabs:

```js
    RadarClient.alloc('example', function() {
      RadarClient.presence('chat/1').on(function(message) {
        if (!message.op || !message.value) { return; }
        for (var userId in message.value) {
          if (!message.value.hasOwnProperty(userId)) { continue; }
          if (message.op == 'online' || message.op == 'offline') {
            console.log('User ' + userId+' is now '+message.op);
          }
        }
      }).sync();
    });
```

Then, run this code in each of the tabs:

```js
    RadarClient.presence('chat/1').set('online');
```

You should see a log message that looks something like this:

    Scope {prefix: "presence:/dev/chat/1", client: Client, set: function, get: function, subscribe: function…}
    User 25 is now online

In the Radar client configuration in Step 3, we set the `userId` option to a random number between 0 and 100, so you'll get adifferent user id for each client (tab).

Now, close one of the tabs.  Initially, you will not see any additional debug output in the console window.  Then, after about 15 seconds, you will see output similar to this:

    radar_client info {"to":"presence:/dev/chat/1","op":"client_offline","value":{"userId":19,"clientId":"CmuZcU4wvUMTiDx9AAAK"},"direction":"in"}

And then, after about 30 seconds, you should see this:

    User 19 is now offline

where `19` is the clientId of the client in the closed tab. Note that in the tab that is now closed, you could have instead issued the command:

```js
    RadarClient.presence('chat/1').set('offline');
```

and this would have triggered an "offline" message immediately - the 15 second delay only applies if you close the tab without telling Radar that you're going offline (an ungraceful exit).

Though not demonstrable in this test scenario, a single user can have multiple client sessions, and only when the last client session has ended is the user considered a candidate for being "offline".  When the last client session for a user is implicitly made offline, there is a timeout - or grace period - during which the user can create a new client session that will keep the user "online".  If no new client session is created, then the user goes offline once the timeout expires. In contrast, an *explicit* offline ignores the timeout period, and puts the user in an offline state immediately.

Radar supports two granularities of events:
- `online`/`offline` messages are triggered when a user comes online or when all of their client sessions have gone offline or have timed out.
- `client_online`/`client_offline` messages are triggered when a client session comes online or goes offline.

Typically, one user might have multiple clients if they open multiple browser windows or tabs. When triggering user `offline` messages, there is a grace period of 15 seconds (configurable). This allows users to experience short-term network issues, or to reload a Radar-enabled page without being immediately considered to be offline.

Usually, you want to use the `online` and `offline` events unless you want to specifically track client sessions and do the work mentioned above on the client side.

### 9. Status resources and the REST API

...

# Radar client

Read the [client docs](client.html) for details.

# Radar server

Read the [server docs](server.html) for details.

# REST API

Read the [REST API docs](rest.html) for details.

## Copyright and License

Radar is Copyright 2012, Zendesk Inc.

Licensed under the Apache License Version 2.0, http://www.apache.org/licenses/LICENSE-2.0

