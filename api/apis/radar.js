/* eslint-disable node/no-deprecated-api */

const url = require('url')
const { Status, MessageList, Presence, PresenceManager, Type } = require('../../src/core')
const hostname = require('os').hostname()

function jsonResponse (response, object) {
  response.setHeader('Content-type', 'application/json')
  response.setHeader('Cache-Control', 'no-cache')
  response.end(JSON.stringify(object))
}

function parseData (response, data, ResourceType) {
  let parameters = data

  if (typeof data === 'string') {
    try {
      parameters = JSON.parse(data)
    } catch (e) {
      parameters = false
    }
  }

  if (!parameters || !parameters.accountName || !parameters.scope) {
    return jsonResponse(response, {})
  }

  const resourceTo = ResourceType.prototype.type + ':/' + parameters.accountName + '/' + parameters.scope
  const options = Type.getByExpression(resourceTo)
  const resource = new ResourceType(resourceTo, {}, options)

  resource.accountName = parameters.accountName
  resource.scope = parameters.scope

  resource.key = parameters.key
  resource.value = parameters.value

  return resource
}

// Note that Firefox needs a application/json content type or it will show a warning

// curl -k -H "Content-Type: application/json" -X POST -d '{"accountName":"test","scope":"ticket/1","key":"greeting","value":"hello"}' https://localhost/radar/status
function setStatus (req, res, re, data) {
  const status = parseData(res, data, Status)

  if (status) {
    if (!status.key || !status.value) {
      return jsonResponse(res, {})
    }

    status._set(status.to,
      {
        op: 'set',
        to: status.to,
        key: status.key,
        value: status.value
      }, status.options.policy || {}, function () {
        jsonResponse(res, {})
      })
  }
}

// curl -k "https://localhost/radar/status?accountName=test&scope=ticket/1"
function getStatus (req, res) {
  const parts = url.parse(req.url, true)
  const status = parseData(res, parts.query, Status)

  if (status) {
    status._get('status:/' + status.accountName + '/' + status.scope, function (replies) {
      jsonResponse(res, replies)
    })
  }
}

function setMessage (req, res, re, data) {
  const message = parseData(res, data, MessageList)

  if (message) {
    if (!message.value) {
      return jsonResponse(res, {})
    }

    message._publish(message.to, message.options.policy || {},
      {
        op: 'publish',
        to: 'message:/' + message.accountName + '/' + message.scope,
        value: message.value
      }, function () {
        jsonResponse(res, {})
      })
  }
}

function getMessage (req, res) {
  const parts = url.parse(req.url, true)
  const message = parseData(res, parts.query, MessageList)

  if (message) {
    message._sync(message.to, message.options.policy || {}, function (replies) {
      jsonResponse(res, replies)
    })
  }
}

// curl -k "https://localhost/radar/presence?accountName=test&scope=ticket/1"
// Version 1:
//  - Response for single scope: { userId: userType }
//  - Response for multiple scopes (comma separated): { scope: { userId: userType } }
// Version 2:
//  - Version number is required (e.g. &version=2)
//  - Response for single scope: { userId: { "clients": { clientId1: {}, clientId2: {} }, userType: }  }
//  - Response for multiple scopes: {  scope1: ... above ..., scope2: ... above ...  }
function getPresence (req, res) {
  const parts = url.parse(req.url, true)
  const q = parts.query
  if (!q || !q.accountName) { return res.end() }
  if (!(q.scope || q.scopes)) { return res.end() }
  const versionNumber = parseInt(q.version, 10)
  // Sadly, the responses are different when dealing with multiple scopes so can't just put these in a control flow
  if (q.scope) {
    const monitor = new PresenceManager('presence:/' + q.accountName + '/' + q.scope, {}, Presence.sentry)
    monitor.fullRead(function (online) {
      res.setHeader('Content-type', 'application/json')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('X-Radar-Host', hostname)
      if (versionNumber === 2) {
        res.end(JSON.stringify(monitor.getClientsOnline()) + '\n')
      } else {
        res.end(JSON.stringify(online) + '\n')
      }
    })
  } else {
    const scopes = q.scopes.split(',')
    const result = {} // key: scope - value: replies
    scopes.forEach(function (scope) {
      const monitor = new PresenceManager('presence:/' + q.accountName + '/' + scope, {}, Presence.sentry)
      monitor.fullRead(function (online) {
        if (versionNumber === 2) {
          result[scope] = monitor.getClientsOnline()
        } else {
          result[scope] = online
        }
        if (Object.keys(result).length === scopes.length) {
          res.setHeader('Content-type', 'application/json')
          res.setHeader('Cache-Control', 'no-cache')
          res.setHeader('X-Radar-Host', hostname)
          res.end(JSON.stringify(result) + '\n')
        }
      })
    })
  }
}

module.exports = {
  setStatus: setStatus,
  getStatus: getStatus,
  setMessage: setMessage,
  getMessage: getMessage,
  getPresence: getPresence
}
