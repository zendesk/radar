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

## Installing

    npm install radar_client

# Radar client

## Basic usage

    RadarClient.configure({ ... }).alloc('example', function (){
      RadarClient.status("invite/1234")
        .on(function(msg) { console.log(msg) })
        .sync();
    }).connect();

"example" is an arbitrary name for your functionality, which is used to determine whether to keep the connection alive or not.

API calls - see the [REST API docs](rest.html) for more details:

    curl -k -H "Content-Type: application/json" -X POST \
    -d '{"accountName":"test","scope":"invite/1234", \
    "key":"greeting","value":"hello"}' https://localhost/radar/status

## Configuration

The backend URL needs to be configured before using RadarClient.

    RadarClient.configure({
      host: 'localhost',
      port: 8000,
      secure: false,
      userId: 1,
      userType: 2,
      accountName: 'test'
    });

The configuration object is passed to the underlying [engine.io-client](https://github.com/LearnBoost/engine.io-client).

## Connecting via .alloc() / .dealloc()


The .alloc() and .dealloc() connection API allows multiple independent parts of a web app to use a single persistent connection. This way the Radar client can tell when no-one is using the connection. If a direct connect()/disconnect() API was used, inpendent parts of the app could accidentally disconnect even when the connection is still used elsewhere.

- `.alloc(name, callback)`
  - Ensures that a connection is established, then calls the callback. If the connection is not established, then the call is delayed until connected.
  - The name can be any string unique to the functionality (e.g. chat, voice etc.)

- `.dealloc(name)`
  - Indicates that the connection is no longer needed by the named functionality.
  - When no-one needs the connection, issues a disconnect.

Unlike a simple counter, alloc() and dealloc() can be safely called multiple times.

## Accessing resources

The Radar client API is resource-based. Resources have a type and a name, and support different operations.

- `RadarClient.presence(name)`: "whether a user is online and marked as present on this resource". Presence is tied to the user ID.
- `RadarClient.status(name)`: "a hash with subkeys you can subscribe to, such as when a post was last updated". Status resources exist so that your can receive notifications about a single value changing, for example, when your web backend updates a value.
- `RadarClient.message(name)`: "a ordered stream of messages". Message lists are like chat message streams. They contain messages, and can be configured to store those messages so that new participants can fetch the full history of messages. In the event of a connection loss, any messages sent while disconnected are sent when the connection is re-established.

Each of these returns a chainable object specific to that resource + name.

For example:

    RadarClient.presence(name).on(function(message) {
        console.log(message);
      }).set('online').sync();


## Message handlers


All resources accept message handlers. Message handlers are triggered when a message relevant to the resource is received. You have three choices:

- `.on(callback)`: attach a handler permanently until explicitly removed
- `.once(callback)`: attach a handler that is removed after it is triggered once
- `.when(callback)`: attach a handler that is only removed if the return value from the handler is true. Useful for waiting for a specific message.

Callbacks accept one argument, which is the message returned from the backend.

## Operations

Each resource type has its own set of operations.

### Operation acknowledgements

Many functions take an optional [ack] callback function argument as their last parameter. If the ack callback is specified, the client requests an acknowledgement (ACK) from the server, and runs the callback when the ACK is received. This is useful for tests and when you want to be sure that an operation has completed before going to the next one.

## Presence resources

These are binary (e.g. online and offline). Presence is tied to the user id, and it can be set to "offline" either explicitly, or if the user's TCP connection is lost (there is a grace period up to 30 seconds).

### Presence API methods .presence("scope").*

- `.get(callback)`
  - Immediately retrieves the presence resource content and returns it.
  - callback(message): message is a JSON object, which looks like this:

    {
      "op": "get"
      "value": { "123": 0 }
    }

Here, 123 is the user ID, and 0 is the user's type (0 = enduser, 2 = agent, 4 = admin).

If the user is offline, they will not be included in the result.

- `.set('online', [ack])` / `.set('offline', [ack])`
  - Sets presence
- `.subscribe([ack])`
  - Subscribes to notifications on the current presence resource (which includes the current user and other users that act on that presence resource)
- `.unsubscribe([ack])`
  - Removes a subscription

## Status resources

Push notifications about changes to a variable.

Status resources can have multiple values (e.g. browser, phone, unavailable). Status is per-user, but it never expires by itself and is not tied to user presence.

### Status API methods .status("scope").*

- `.get(callback)`
  - Immediately retrieves the status resource content and returns it.
  - callback(message): message is a JSON object, which looks like this:

    {
      "op": "get"
      "value": { "123": "foo" }
    }

Here, 123 is the user ID, and "foo" is the value set by calling status('abc').set('foo');

You can set the value to an arbitrary JSON object: ```.status('voice/status').set({ hello: "world" });```

- `.set('foo', [ack])`
  - Sets status
- `.subscribe([ack])`
  - Subscribes to notifications
- `.unsubscribe([ack])`
  - Removes a subscription

## Message list resources

Message streams about a topic.

Message lists contain ordered information that can be appended to, and can be synchronized. In the event of a connection loss, any messages sent while disconnected are sent when the connection is re-established.

### Message list API methods

Note: the API here conforms to the Drone API so that we can transition from Drone to Radar_client fairly easily.

- `.subscribe('channel')`
- `.unsubscribe('channel')`
- `.sync('channel')`
- `.publish('channel', message)`

By default, message list resources are not persistent - e.g. messages will be sent to subscribers, but the message history is not accessible. You can configure message persistence on a per-resource-type basis in the server - see the server configuration for details.


## Client states

There are a few states that the client UI should handle gracefully:

- "connected" AKA "ready": This should be a once() callback, and set up the basic UI.
- "disconnected": If this state occurs, then the UI should be set in a state that 1) makes it clear that communication is currently not possible and 2) allows the user to perform a reconnection. For example, gray out all users in a chat and show a yellow notification stating "reconnecting".
- "reconnecting": the notification should change to show that a reconnection is in progress or is pending:
  reconnecting(in_seconds) events should occur.
- "reconnected": the notification should change to show that the user is now connected again.
- "unavailable": If this state occurs, then the UI should show a message that the connection could not be established.

# REST API

Read the [REST API docs](rest.html) for the details.

# Radar server

## Starting the sample server

    git clone ...
    npm install
    npm start

`npm start` starts the example server.

## Installing the Radar server

    npm install --save radar

## Configuration

 Radar attaches to a regular Node http server. The API and the server can be attached separately: if you don't want the REST API, you can leave it out or switch it with a custom API.

    var http = require('http'),
        Radar = require('radar').server,
        Api = require('radar').api,
        httpServer = http.createServer(function(req, res) {
          res.end('Nothing here.');
        });

    // Radar API
    Api.attach(httpServer);

    // Radar server
    Radar.attach(httpServer, { redis_host: 'localhost', redis_port: 6379 });

    httpServer.listen(8000);

The server accepts two configurable options:

- `redis_host` and `redis_port`: the hostname and port where the Redis server is running

## Authentication and persistence

Authentication and persistence are configured on a resource-type basis.

The resource type is detected by checking resource names against a regular expression in the server.

Resources are given names based on 1) their type and 2) the accountName associated with the resource. For example:

- status:/dev/foo/bar represents a status resource, for the account "dev", named "foo/bar"
- message:/test/chat/1 represents a message list resource, for the account "test", named "chat/1"
- presence:/test/chat/1 represents a presence resource, for the account "test", named "chat/1"

Policies are specified by defining and registering resource types on the server. For example:


    var http = require('http'),
        Radar = require('radar').server,
        Type = require('radar').core.Type;

    var types = require('./my_types.js');

    Object.keys(types).forEach(function(name) {
      Type.register(name, types[name]);
    });
    // ... and then later
    server = http.createServer(function() { ... });
    Radar.attach(server, configuration);

Each policy has a name, and a set of properties. `my_types.js` could contain something like this:

    module.exports = {
      chat_messages: {
        expr: new RegExp('^message:/.+/chat/.+$'),
        type: 'message',
        policy: { cache: true },
        auth: function(message) {
          //...
        }
      }
    };

The `expr` property is used to match real resource names to their types. It should be a regular expression for the resource.

The `type` property specifies the type of the resource. This is used for legacy purposes.

### Authentication

Authentication is configured using the `auth` key. The value should be a function that takes the given message, and returns true if the authentication is valid, or false if it is not. By default, no authentication is required.

The authentication function cannot access session information, it can only access the current message. This is by design: each request should contain all the information needed to service it, so that requests can be load balanced in a round-robin fashion (though right now the transport e.g. engine.io does assume sticky sessions).

You can use any authentication scheme you want. One way to do this is to use [token](https://github.com/mixu/token), which generates a HMAC hash based on a shared secret. The main application can generate these tokens via the shared secret when a user is authenticated, and the Radar backend server can verify their validity. This way you do not need to share sessions between separate applications.

### Persistence

Persistence policies can be applied to message and status resources. Persistence options:

- `cache`: true | false
- `maxAgeSeconds`: number - applicable to both message list and status resources. With message lists, messages older than maxAgeSeconds are pruned on read. With status resources, status resources unused (not updated) for maxAgeSeconds will be removed.
- `maxCount`: number - only applicable to message list resources

The default is not to cache messages. If persistence policies are set, they are enforced lazily on read.

## Deployment

Radar can be deployed as a single instance directly serving requests, or with multiple instances of the Radar server behind a load balancer.

If a load balancer is used, then servers behind the load balancer can be restarted safely, and the clients will recover their connections as long as at least one Radar server remains available.

The load balancer must use source IP sticky sessions. Radar itself does not need sticky sessions, as it can recover the correct state from Redis and the client, but Engine.io does (due to the way handshakes are done). Radar clients will recover from a server crash, as long as the load balancer points them to a different server.

For more information about deploying Radar, read [this chapter on Comet and Socket.io](http://book.mixu.net/ch13.html), which includes sample configurations for HAProxy. While this is not specific to Radar, the same principles apply.

Normal Redis replication can be used to scale beyond a single Redis backend (or, the servers can be sharded e.g. by account, each with their own backend).

## Copyright and License

Radar is Copyright 2012, Zendesk Inc.

Licensed under the Apache License Version 2.0, http://www.apache.org/licenses/LICENSE-2.0

