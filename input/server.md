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

