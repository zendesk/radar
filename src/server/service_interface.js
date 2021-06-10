/* eslint-disable node/no-deprecated-api */

const EventEmitter = require('events').EventEmitter
const inherits = require('util').inherits
const httpAttach = require('http-attach')
const log = require('minilog')('radar:service_interface')
const parseUrl = require('url').parse
const RadarMessage = require('radar_message')
const concatStream = require('concat-stream')
const id = require('../core/id')
const parseContentType = require('content-type').parse

function ServiceInterface (middlewareRunner) {
  this._middlewareRunner = middlewareRunner || noopMiddlewareRunner
  log.debug('New ServiceInterface')
}

const noopMiddlewareRunner = {
  runMiddleware: function () {
    const callback = arguments[arguments.length - 1]
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
  req.id = req.id || id()
  log.info('Incoming ServiceInterface request', req.method, req.id)
  switch (req.method) {
    case 'GET':
      this._get(req, res)
      break
    case 'POST':
      this._post(req, res)
      break
    default: {
      const err = new Error('not found')
      err.statusCode = 404
      error(err, res)
    }
  }
}

// simple "get"
ServiceInterface.prototype._get = function (req, res) {
  const self = this
  const qs = parseUrl(req.url, true).query

  if (!qs.to) {
    const e = new Error('Missing required parameter to')
    e.statusCode = 400
    return error(e, res)
  }

  const message = RadarMessage.Request.buildGet(qs.to).message

  try {
    log.info('POST incoming message', message)
    self._processIncomingMessage(message, req, res)
  } catch (e) {
    e.statusCode = e.statusCode || 500
    return error(e, res)
  }
}

const SHOW_STACK_TRACE = !String(process.env.NODE_ENV).match(/prod/i)
function error (err, res) {
  err.statusCode = err.statusCode || 400
  log.warn(err.statusCode, err.stack)
  res.statusCode = err.statusCode
  const message = { op: 'err' }

  if (err.statusCode === 401 || err.statusCode === 403) {
    message.value = 'auth'
  }

  if (SHOW_STACK_TRACE) {
    message.stack = err.stack
    message.code = err.statusCode
  }
  res.setHeader('content-type', 'application/json')
  res.write(JSON.stringify(message))
  res.end()
}

ServiceInterface.prototype._post = function (req, res) {
  const self = this

  try {
    var contentType = parseContentType(req.headers['content-type']).type
  } catch (e) {
    log.info('Parsing content-type failed', req.headers['content-type'])
  }

  if (!req.headers || contentType !== 'application/json') {
    const err = new Error('Content-type must be application/json')
    err.statusCode = 415
    return error(err, res)
  }

  req.pipe(concatStream(function (body) {
    try {
      var message = JSON.parse(body)
    } catch (e) {
      const err = new Error('Body must be valid JSON')
      err.statusCode = 400
      return error(err, res)
    }

    try {
      log.info('POST incoming message', message)
      self._processIncomingMessage(message, req, res)
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

function ServiceInterfaceClientSession (req, res) {
  this.id = req.headers['x-session-id'] || req.id
  this._req = req
  this._res = res
}

ServiceInterfaceClientSession.prototype.send = function (msg) {
  if (this._res.finished) {
    log.warn('ServiceInterfaceClientSession already ended, dropped message', msg)
    return
  }

  if (this._res.statusCode < 400 && msg.op === 'err') {
    if (msg.value === 'auth') {
      this._res.statusCode = 403
    } else {
      this._res.statusCode = 400
    }
  }

  log.debug('ServiceInterfaceClientSession Send', this._res.statusCode, msg)
  this._res.write(JSON.stringify(msg))
  this._res.end()
}

ServiceInterface.prototype._processIncomingMessage = function (message, req, res) {
  const self = this

  if (!allowedOp(message.op)) {
    const err = new Error('Only get and set op allowed via ServiceInterface')
    err.statusCode = 400
    return error(err, res)
  }

  this._middlewareRunner.runMiddleware('onServiceInterfaceIncomingMessage', message, req, res, function (err) {
    if (err) { return error(err, res) }

    const clientSession = new ServiceInterfaceClientSession(req, res)

    message.ack = message.ack || clientSession.id
    log.info('ServiceInterface request', message)
    self.emit('request', clientSession, message)
  })
}

function setup (httpServer, middlewareRunner) {
  const serviceInterface = new ServiceInterface(middlewareRunner)
  httpAttach(httpServer, function () {
    serviceInterface.middleware.apply(serviceInterface, arguments)
  })

  return serviceInterface
}

module.exports = ServiceInterface
module.exports.setup = setup
