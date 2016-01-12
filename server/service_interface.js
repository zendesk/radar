var EventEmitter = require('events').EventEmitter
var inherits = require('util').inherits
var httpAttach = require('http-attach')
var log = require('minilog')('radar:service_interface')
var parseUrl = require('url').parse
var Type = require('../core/lib/type')

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
  getResource(qs.to, function (err, value) {
    if (err) { return error(err, res) }

    res.write(JSON.stringify(value))
    res.end()
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

ServiceInterface.prototype._post = function (req, res) {}

function setup (httpServer) {
  var serviceInterface = new ServiceInterface()
  httpAttach(httpServer, function () {
    serviceInterface.middleware.apply(serviceInterface, arguments)
  })

  return serviceInterface
}

module.exports = ServiceInterface
module.exports.setup = setup
