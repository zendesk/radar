var EventEmitter = require('events').EventEmitter
var inherits = require('util').inherits
var httpAttach = require('http-attach')
var log = require('minilog')('radar:service_interface')
var parseUrl = require('url').parse
var RadarMessage = require('radar_message')
var concatStream = require('concat-stream')
var uuid = require('uuid')

function ServiceInterface (middlewareRunner) {
  this._middlewareRunner = middlewareRunner || noopMiddlewareRunner
  log.debug('New ServiceInterface')
}

var noopMiddlewareRunner = {
  runMiddleware: function () {
    var callback = arguments[arguments.length - 1]
    callback()
  }
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
  var self = this
  var qs = parseUrl(req.url, true).query

  if (!qs.to) {
    return getSampleResponse(res)
  }

  var message = RadarMessage.Request.buildGet(qs.to).message

  try {
    log.info('POST incoming message', message)
    self._postMessage(message, req, res)
  } catch (e) {
    e.statusCode = e.statusCode || 500
    return error(e, res)
  }
}

function error (err, res) {
  err.statusCode = err.statusCode || 400
  log.warn(err.statusCode, err.stack)
  res.statusCode = err.statusCode
  var message = {op: 'err'}

  if (process.env.NODE_ENV !== 'PRODUCTION') {
    message.stack = err.stack
    message.code = err.statusCode
  }
  res.setHeader('content-type', 'application/json')
  res.write(JSON.stringify(message))
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
  var self = this

  if (!allowedOp(message.op)) {
    var err = new Error('Only get and set op allowed via ServiceInterface')
    err.statusCode = 400
    return error(err, res)
  }

  this._middlewareRunner.runMiddleware('onServiceInterfacePostMessage', message, req, res, function (err) {
    if (err) { return error(err, res) }

    var clientSession = {
      id: req.id,
      send: function (msg) {
        if (res.finished) {
          log.info('ServiceInterfaceClientSession already ended, dropped message', msg)
          return
        }

        log.debug('ServiceInterfaceClientSession Send', msg)
        if (msg.op === 'err') {
          res.statusCode = 400
        }
        res.write(JSON.stringify(msg))
        res.end()
      }
    }

    message.ack = message.ack || clientSession.id
    self.emit('request', clientSession, message)
  })
}

function setup (httpServer, middlewareRunner) {
  var serviceInterface = new ServiceInterface(middlewareRunner)
  httpAttach(httpServer, function () {
    serviceInterface.middleware.apply(serviceInterface, arguments)
  })

  return serviceInterface
}

module.exports = ServiceInterface
module.exports.setup = setup
