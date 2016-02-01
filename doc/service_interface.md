# Radar Service Interface

The Service Interface is a simple HTTP-based interface for services to query radar.

## Service Endpoint

- http(s)://hostname:port/radar/service

## GET

E.g. `http://localhost:8000/radar/service?to=status:/segment/foobar`

### Querystring Parameters
- `to` : the full resource scope, e.g. `status:/segment/foobar`

This is a simplified case of the POST endpoint for Radar resources supporting `get` operations.

### Response
A `get server message` depending on the resource type, e.g. for a Status:

```json
{
  "op": "get",
  "to": "status:/account/clients/1452556889570",
  "value": {
    "1452556889570": "sdf"
  }
}
```

or for a Presence:

```json
{
  "op": "get",
  "to": "presence:/account/box1",
  "value": {
    "1452560641403": 2
  }
}
```

## POST

E.g. `http://localhost:8000/radar/service`

### Headers

| name | value  |
| -----|------- |
| Content-Type | application/json |

### Body
A JSON-encoded [Radar message](https://github.com/zendesk/radar/blob/master/doc/RadarMessageSpecificationV2.md)

```json
{
  "op": "set",
  "to": "status:/account/clients/1452556889570",
  "key": "0fe3a",
  "value": {
    "color": "c0ffee"
  }
}
```

### Response
- 200 plus `application/json` Radar response message depending on input.
- 400 on client-side error.
- 500 on server error.
