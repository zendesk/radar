## The Radar REST API

Overview:

- Presence should only be set from the Radar client, not via the API.
This is because "being present" means that you are available for push
communication, so you should be using a full client.

- The REST API is hooked into the same
request/authenticate/process/respond workflow as an individual message
from a engine.io client.

### Examples:

#### Status

```shell
curl -H "Content-Type: application/json" -X POST -d '
{ "op": "set", "to": "status:/test/ticket/2", "key": "foo", "value": "bar", "ack": 21 }
' http://localhost:8000/api
# {"op":"ack","value":21}

curl -H "Content-Type: application/json" -X POST -d '
{ "op": "get", "to": "status:/test/ticket/2" }
' http://localhost:8000/api
# {"op":"get","to":"status:/test/ticket/2","value":{"foo":"bar"}}
```

The keys and values of the hash are determined by the content of the status. Often these are userID: value pairs.

#### Presence

Presence should only be set from the Radar client, not via the API.

```shell
# You should not do this, but for the sake of this example we can simulate a present client by running the following in a separate terminal:
# curl -v -k -H "Content-Type: application/json" -X POST -d '{ "op": "set", "to": "presence:/test/ticket/2", "key": 123, "value": "online", "userData": { "name": "joe" } }' http://localhost:8000/api

curl -H "Content-Type: application/json" -X POST -d '
{ "op": "get", "to": "presence:/test/ticket/2", "options": { "version": 2 } }
' http://localhost:8000/api
# {"op":"get","to":"presence:/test/ticket/2","value":{"123":{"clients":{"rest_client-823139":{"name":"joe"}}}}}
```

These keys are typically the user IDs of present users and the values
are a hash of users and clients with the userData for each client.

### MessageList

```shell
curl -H "Content-Type: application/json" -X POST -d '
{ "op": "publish", "to": "message:/test/ticket/2", "value": "hello", "ack": 22 }
' http://localhost:8000/api
# {"op":"ack","value":22}

curl -H "Content-Type: application/json" -X POST -d '
{ "op": "get", "to": "message:/test/ticket/2" }
' http://localhost:8000/api
# {"op":"get","to":"message:/test/ticket/2","value":["{\"op\":\"publish\",\"to\":\"message:/test/ticket/2\",\"value\":\"hello\",\"ack\":22}","1407360686077"],"time":1407360714899}
```

The response includes all the messages have not yet expired (based on the message retention policy on the server side, e.g. time-limited for some resources).
