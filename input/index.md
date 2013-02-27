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

## Quickstart

# Radar client

Read the [client docs](client.html) for the details.

# Radar server

Read the [server docs](server.html) for the details.

# REST API

Read the [REST API docs](rest.html) for the details.

## Copyright and License

Radar is Copyright 2012, Zendesk Inc.

Licensed under the Apache License Version 2.0, http://www.apache.org/licenses/LICENSE-2.0

