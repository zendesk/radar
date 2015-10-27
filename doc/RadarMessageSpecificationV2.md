# Purpose

This document describes version 2 of the radar message protocol, which is the
**de facto** version that is currently implemented in the code.

# Overview

Radar messages are constructed explicitly by a client (e.g. **radar client**) or
implicitly by writing a suitably formatted json object to the **redis store**
that backs radar.

In addition, **radar server** also generates messages in response to client
messages, and these include **data messages**, **ack messages**, and **error
messages**

## Approach

This document lists messages created by **radar client**, and interleave
messages returned by **radar server**.

Any leftover messages are described at the end of the document.

# Radar Client

## Matrix of Client Operations

```
                       MESSAGE TYPE

API             Ctrl  Mlst  Pres  Stat  Strm              LEGEND:

get                         X     X     X                   Ctrl: Control
                                                            Mlst: MessageList
nameSync        X                                           Pres: Presence
                                                            Stat: Status
publish               X                                     Strm: Stream

push                                    X

set                         X     X

subscribe             [X]   X     [X]   X                   [X]: called via sync

sync                  X     X     X     X

unsubscribe           X     X     X
```

## Client Messages

The client operations listed above have associated **client messages**.  The
steps for sending a client message are these:

* Each API **_write**s an explicitly composed **client message**
* _write adds an **ack** property and emits an **authenticateMessage** message
* the **authenticateMessage** handler sets optional **userData (1)** and **auth
  (4)** properties:
    - userData: userData
    - auth: auth
    - userId: userId
    - userType: userType
    - accountName: accountName

### Client Message Operations and associated parts
Listed below is:

* each client operation
* its associated unique message properties
* its associated server response message, whose form will differ based on the
  **message type** (see matrix above for message types)

________________________________________________________________________________
<a id="get_message"></a>
### get
Get **data** from the server that is related to the provided **scope**.
```json
{
  "op": "get",
  "to": "<scope>",
  [options: options]
}
```

Examples:
```json
{
   "op":"get",
   "to":"presence:/jdoe_inc/test/1",
  "userData":{"name":"John Doe","id":123456789}
}
```
```json
{
  "op":"get",
  "to":"status:/jdoe_inc/voice/availability/123456789",
  "userData": {
    "name": "John Doe",
    "id": 123456789
  }
}
```

[**get** server messages](#get_server_messages)

________________________________________________________________________________
<a id="namesync_message"></a>
### nameSync
Send a client **name** and associated **id** to the server, so that the server
can map the *name* to the *id*.  We do this because certain messages contain the
associated *id*, but not the *name*, and on the server we want to track activity
by *name*.

```json
{
  "op": "nameSync",
  "to": "<scope>",
  [options: options]
}
```
[**nameSync** server message](#namesync_server_message)

________________________________________________________________________________
<a id="publish_message"></a>
### publish
Publish a **value** to the provided **scope**.  The message is persisted, and
through pub/sub is published to subscribers.

```json
{
  "op": "publish",
  "to": "<scope>",
  "value": [value]
}
```

Examples:
```json
{
  "op":"publish",
  "to":"message:/jdoe_inc/chat/manager/session/sKzwHUoALDbIb3poKGvYlenUzUzgCwwP6addsohhA9kSGV+NF/x9xLx3p4KASi3pOqcoi3RyN2oCAegsrDeFSA==",
  "value": {
    "type": "createChat",
    "resource": "chat",
    "action": "create",
    "account": "jdoe_inc",
    "user_id": 123456789
  },
  "ack": 2,
  "userData": {
    "name": "Anonymous user",
    "id": 0
  }
}
```
```json
{
  "op": "publish",
  "to": "message:/jdoe_inc/chat/c512b5c8c78b2f1a44d1247744c79c97e2f5c91e/messages",
  "value": {
    "type": "activity",
    "user_id": 123456789,
    "state": 4
  },
  "userData": {
    "name": "Anonymous user",
    "id": 0
  }
}
```

[**publish** server message](#publish_server_message)

________________________________________________________________________________
<a id="push_message"></a>
### push
Push a **resource, action** and **value** to the provided **scope**.
(Implemented on streams, and not yet used by any consumer.)

```json
{
  "op": "push",
  "to": "<scope>",
  "resource": [resource]
  "action": [action]
  "value": [value]
```
[**push** server message](#push_server_message)

________________________________________________________________________________
<a id="set_message"></a>
### set
Set a **value** on the provided **scope**.

```json
{
  "op": "set",
  "to": [scope],
  "value": [value],
  "key": [config.userId],
  "type": [config.userType],
```

Examples:
```json
{
  "op": "set",
  "to": "presence:/jdoe_inc/ticket/81649",
  "value": "online",
  "key": 123456789,
  "type":4,
  "userData": {
    "name": "John Doe",
    "id": 123456789
  }
}
```
```json
  {
  "op": "set",
  "to": "status:/jdoe_inc/ticket/332137",
  "value": "{\"states\":{\"edited\":false,\"focused\":false}}",
  "key": 123456789,
  "type": 4,
  "ack": 1569,
  "userData": {
    "name": "John Doe",
    "id": 123456789
  }
}
```

[**set** server messages](#set_server_messages)

________________________________________________________________________________
<a id="subscribe_message"></a>
### subscribe
Subscribe to the provided **scope**.  That is, notify the subscriber of any
changes to the **scope**.

```json
{
  "op": "subscribe",
  "to": "<scope>",
  [options: options]
}
```

Examples:
```json
{
  "op": "subscribe",
  "to": "message:/jdoe_inc/chat/user/123456789",
  "userData": {
    "name": "John Doe",
    "id": 123456789
  }
}
```
```json
{
  "op": "subscribe",
  "to": "presence:/jdoe_inc/test/1",
  "ack": 1,
  "userData": {
    "name": "John Doe",
    "id": 123456789
  }
}
```
```json
{
  "op": "subscribe",
  "to": "status:/jdoe_inc/expiry/tickets/1051856/comments",
  "userData": {
    "name": "John Doe",
    "id": 123456789
  }
}
```

[**subscribe** server messages](#subscribe_server_messages)

________________________________________________________________________________
<a id="sync_message"></a>
### sync
Perform a **get** as above, and in addition, perform a **subscribe**, described
above.

```json
{
  "op": "sync",
  "to": "<scope>",
  [options: options || { version: 2 }]
}
Examples:
```json  
{
  "op": "sync",
  "to": "message:/jdoe_inc/chat/853264cdd19101b81d570871941be55e746f75f0/messages",
  "userData": {
    "name": "Anonymous user",
    "id": 0
  }
}
```
```json
{
  "op": "sync",
  "to": "presence:/jdoe/ticket/7310",
  "options": {
    "version": 2
  },
  "userData": {
    "name": "John Doe",
    "id": 123456789
  }
}
```
```json
{
  "op": "sync",
  "to": "status:/jdoe_inc/voice/availability/123456789",
  "userData": {
    "name": "John Doe",
    "id": 123456789
  }
}
```

[**sync** server messages](#sync_server_messages)

________________________________________________________________________________
<a id="unsubscribe_message"></a>
### unsubscribe
Unsubscibe from the provided **scope**.  That is, the subscriber will no longer
be a subscriber to the provided **scope**, and so will no longer receive
notifications of changes to the scope.

```json
{
  "op": "unsubscribe",
  "to": "<scope>"
}
```

Examples:
```json
{
  "op": "unsubscribe",
  "to": "message:/jdoe_inc/chat/c512b5c8c78b2f1a44d1247744c79c97e2f5c91e/messages",
  "ack": 4,
  "userData": {
    "name": "Anonymous user",
    "id": 0
  }
}
```
```json
{
  "op": "unsubscribe",
  "to": "presence:/jdoe_inc/ticket/16772",
  "ack": 1608,
  "userData": {
    "name": "John Doe",
    "id": 123456789
  }
}
```
```json
{
  "op": "unsubscribe",
  "to": "status:/jdoe_inc/ticket/16772",
  "ack": 1625,
  "userData": {
    "name": "John Doe",
    "id": 123456789
  }
}
```

[**unsubscribe** server messages](#unsubscribe_server_messages)

________________________________________________________________________________
## ACK Server Message
The most common type of server (i.e. client response) message is the **ack**
message.  This message is listed in the **Server Messages** below simply as
**ACK**.

### ack server message
<a id="ack_server_message"></a>
```json
{
  "op": "ack",
  "value": [message.ack]
}
```
## Server Messages 

Server messages differ based on the type of client message, i.e. **control,
messageList, presence, status, and stream.**

<a id="get_server_messages"></a>
### get - _presence_ server message
```json
{
  "op": "get",
  "to": "<scope>",
  "value": online_clients (object hash userId -> client)
}
```

### get - _status_ server message
```json
{
  "op": "get",
  "to": "<scope>",
  "value": replies (all values for object 'name')
}
```

### get - _stream_ server message
```json
{
  "op": "get",
  "to": "<scope>",
  "value": values || []
}
```

[**get** client message](#get_message)

________________________________________________________________________________
<a id="namesync_server_message"></a>
### nameSync - _control_ server message
**ACK**

[**nameSync** client message](#namesync_message)

________________________________________________________________________________
<a id="publish_server_message"></a>
### publish - _messageList_ server message

**ACK**

[**publish** client message](#publish_message)

________________________________________________________________________________
<a id="push_server_message"></a>
### push - _stream_ server message

**ACK**

[**push** client message](#push_message)

________________________________________________________________________________
<a id="set_server_messages"></a>
### set - _presence_, _status_ server message

**ACK**

[**set** client message](#set_message)

________________________________________________________________________________
<a id="subscribe_server_messages"></a>
### subscribe - _presence_, _stream_ server message

**ACK**

[**subscribe** client message](#subscribe_message)

________________________________________________________________________________
<a id="sync_server_messages"></a>
### sync - _messageList_ server message

```json
{
  "op": "sync",
  "to": "<scope>",
  "value": replies,
  "time": now
}
```

**ACK**

### sync - _presence_ server message

**ACK**

```json
{
  "op": "get",
  "to": "<scope>",
  "value": online_clients (userId -> client hash)
}
```

### sync - _status_ server message

**ACK**

```json
{
  "op": "get",
  "to": "<scope>",
  "value": replies (all values for hash 'name')
}
```

### sync - _stream_ server message
```json
{
  "op": "get",
  "to": "<scope>",
  "value": values || []
}
```

**ACK**

[**sync** client message](#sync_message)

________________________________________________________________________________
<a id="unsubscribe_server_messages"></a>
### unsubscribe - _messageList_, _presence_ server message

**ACK**

[**unsubscribe** client message](#unsubscribe_message)

________________________________________________________________________________
## Server Error Messages 

The **stream** resource returns errors, and so does the REST API. The rest of
core radar does **not** return errors.

### get - _stream_ server error message
```json
{
  "op": "get",
  "to": "<scope>",
  "error": {
    "type": sync-error,
    "from": from,
    "start": start,
    "end": end,
    "size": size
  },
  "value": []
}
```

### subscribe - _stream_ server error message
```json
{
  "op": "push",
  "to": "<scope>",
  "error": {
    "type": sync-error,
    "from": from,
    "start": start,
    "end": end,
    "size": size
  }
}
```
________________________________________________________________________________
## Additional Comments About Message Handling

1. Auth properties are removed from messages by the TokenAuth **execute**
   method, so that we don't see auth information in our logs.

2. Though we accept an **options** parameter for certain operations (_get,
   nameSync, subscribe, sync_), it is used only by **presence sync** and
   **control nameSync**.
