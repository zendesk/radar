# Radar Service Interface

The Service Interface is a simple HTTP-based interface for services to query radar.

## Service Endpoint

- http(s)://hostname:port/radar/service

## GET

E.g. `http://localhost:8000/radar/service?to=status:/segment/foobar`

Parameters:
- `to` : the full resource scope, e.g. status:/segment/foobar

Returns:
A `get server message` depending on the resource type, e.g. for a Status:

```json
{
  "op": "get",
  "to": "status:/presents/clients/1452556889570",
  "value": {
    "1452556889570": "sdf"
  }
}
```

or for a Presence:

```js
{
  "op": "get",
  "to": "presence:/presents/box1",
  "value": {
    "1452560641403": 2
  }
}
```
## POST

Not yet implemented
