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
