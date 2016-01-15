var EventEmitter = require('events').EventEmitter
var inherits = require('util').inherits
var httpAttach = require('http-attach')
var log = require('minilog')('radar:service_interface')
var parseUrl = require('url').parse
var Type = require('../core/lib/type')
var async = require('async')
var RadarMessage = require('radar_message')
var concatStream = require('concat-stream')
var uuid = require('uuid')

var Presence = require('../core').Presence
var Status = require('../core').Status
var PresenceManager = require('../core').PresenceManager

function ServiceInterface () {
  log.debug('New ServiceInterface')
}

inherits(ServiceInterface, EventEmitter)

ServiceInterface.prototype.middleware = function (req, res, next) {
  if (String(req.url).indexOf('/radar/service') !== 0) {
    log.debug('Request not for service interface')
    return next()
  }
  log.debug('Request for service interface')
  this._dispatch(req, res)
}

ServiceInterface.prototype._dispatch = function (req, res) {
  req.id = uuid.v4()
  log.info('Incoming ServiceInterface request', req.method, req.id)
  switch (req.method) {
    case 'GET':
      this._get(req, res)
      break
    case 'POST':
      this._post(req, res)
      break
    default:
      var err = new Error('not found')
      err.statusCode = 404
      error(err, res)
  }
}

// simple "get"
ServiceInterface.prototype._get = function (req, res) {
  var qs = parseUrl(req.url, true).query

  if (!qs.to) {
    return getSampleResponse(res)
  }

  var scopes = qs.to.split(',')

  async.map(scopes, getResource, function (err, resources) {
    if (err) { return error(err, res) }

    if (resources.length === 1) {
      res.write(JSON.stringify(resources[0]))
      res.end()
    } else {
      var batch = new RadarMessage.Batch()
      resources.forEach(function (resource) {
        batch.add(resource)
      })
      res.write(JSON.stringify(batch))
      res.end()
    }
  })
}

var get = {}

function getResource (scope, callback) {
  var resourceType = parseScope(scope).resourceType
  log.info('GET', resourceType, scope)
  if (!get[resourceType]) {
    return callback(new Error('cannot get resource type ' + resourceType + ' for scope ' + scope))
  }

  get[resourceType](scope, function (err, value) {
    if (err) { return callback(err) }
    var message = {
      op: 'get',
      to: scope,
      value: value
    }
    callback(null, message)
  })
}

get.Presence = function getPresence (scope, callback) {
  var presence = new PresenceManager(scope, {}, Presence.sentry)
  presence.fullRead(function (online) {
    callback(null, online)
  })
}

get.Status = function getStatus (scope, callback) {
  var status = new Status(scope, {}, {})
  status._get(scope, function (replies) {
    callback(null, replies)
  })
}

function parseScope (scope) {
  var parsed = {
    resourceType: null,
    accountName: null,
    resourceId: null
  }

  parsed.resourceType = Type.getByExpression(scope).type

  return parsed
}

function error (err, res) {
  err.statusCode = err.statusCode || 400
  log.warn(err.statusCode, err.stack)
  res.statusCode = err.statusCode
  if (process.env.NODE_ENV !== 'PRODUCTION') {
    res.write('<pre>' + err.statusCode + ' ' + err.stack)
  }
  res.end()
}

function getSampleResponse (res) {
  res.setHeader('content-type', 'text/html')
  res.write('DEV MSG: this is the simple GET service interface.' +
    'must contain a query string with the resource scope, eg ' +
    '<a href="/radar/service?to=presence:/jdoe_inc/test/1">/radar/service?to=presence:/jdoe_inc/test/1</a>')
  res.end()
}

ServiceInterface.prototype._post = function (req, res) {
  var self = this
  if (!req.headers || req.headers['content-type'] !== 'application/json') {
    var err = new Error('Content-type must be application/json')
    err.statusCode = 415
    return error(err, res)
  }

  req.pipe(concatStream(function (body) {
    try {
      var message = JSON.parse(body)
    } catch (e) {
      var err = new Error('Body must be valid JSON')
      err.statusCode = 400
      return error(err, res)
    }

    try {
      log.info('POST incoming message', message)
      self._postMessage(message, req, res)
    } catch (e) {
      e.statusCode = e.statusCode || 500
      return error(e, res)
    }
  }))
}

function allowedOp (op) {
  switch (op) {
    case 'get':
    case 'set':
      return true
    default:
      return false
  }
}

ServiceInterface.prototype._postMessage = function (message, req, res) {
  if (!allowedOp(message.op)) {
    var err = new Error('Only get and set op allowed via ServiceInterface')
    err.statusCode = 400
    return error(err, res)
  }

  var clientSession = {
    id: req.id,
    send: function (msg) {
      log.debug('ServiceInterfaceClientSession Send', msg)
      res.write(JSON.stringify(msg))
      res.end()
    }
  }
  message.ack = message.ack || clientSession.id
  this.emit('request', clientSession, message)
}

function setup (httpServer) {
  var serviceInterface = new ServiceInterface()
  httpAttach(httpServer, function () {
    serviceInterface.middleware.apply(serviceInterface, arguments)
  })

  return serviceInterface
}

module.exports = ServiceInterface
module.exports.setup = setup
