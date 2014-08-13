# radar

# REST API

- All the POST apis respond with:

```js
{}
200: OK
```

### Status

#### /radar/status [POST]

    curl -k -H "Content-Type: application/json" -X POST -d '{"accountName":"test","scope":"ticket/1","key":"greeting","value":"hello"}' https://localhost/radar/status

You probably want to set the key to the current user's ID if you want to have each user have it's own value in the same scope.

You can store any arbitrary string as the value.

##### /radar/status [GET]

    curl -k "https://localhost/radar/status?accountName=test&scope=ticket/1"

###### Response - Status
```js
{
  1: 'foo',
  2: 'bar',
  123: 'foo'
}
200: OK
```

The keys and values of the hash are determined by the content of the status. Often these are userID: value pairs.

### Presence

Presence can only be set from the Radar client, not via the API.

#### /radar/presence [GET]

    curl -k "https://localhost/radar/presence?accountName=test&scope=ticket/1"

You can use scopes=one,two to get multiple scopes in one get:

    curl -k "https://localhost/radar/presence?accountName=test&scopes=ticket/1,ticket/2"

###### Response - Presence
```js
{
  1: 0,
  2: 2,
  123: 4
}
200: OK
```

This the keys are the user IDs of present users, and the values are the user types of the users (0 = end user, 2 = agent, 4 = admin).

When getting multiple scopes, the format is:

```js
{
  "scope1": { ... },
  "scope2": { ... }
}
```


### MessageList

#### /radar/message [POST]

    curl -k -H "Content-Type: application/json" -X POST -d '{"accountName":"test","scope":"chat/123", "value":"hello"}' https://localhost/radar/message

#### /radar/message [GET]

    curl -k "https://localhost/radar/message?accountName=test&scope=dev/test"

###### Response - MessageList
```js
[
  { to: 'message:/dev/test', value: ... },
  { to: 'message:/dev/test', value: ... }
]
200: OK
```

The response includes all the messages have not yet expired (based on the message retention policy on the server side, e.g. time-limited for some resources).
