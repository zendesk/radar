const log = require('minilog')('radar:session_manager')
const ClientSession = require('../client/client_session')
const EventEmitter = require('events').EventEmitter
const inherits = require('util').inherits
const { observable, observe } = require('mobx')
const _ = require('lodash')

function SessionManager (opt) {
  var self = this
  this.sessions = observable.map({})
  observe(self.sessions, function (change) {
    self.emit('change', change)
  })

  this.adapters = (opt && opt.adapters) || []
  this.adapters.forEach(function (adapter) {
    if (!self.isValidAdapter(adapter)) {
      throw new TypeError('Invalid Adapter: ' + adapter)
    }
  })
}
inherits(SessionManager, EventEmitter)

SessionManager.prototype.isValidAdapter = function (adapter) {
  return adapter &&
    typeof adapter.canAdapt === 'function' &&
    typeof adapter.adapt === 'function'
}

// (ClientSesion|Any) => ClientSession?
SessionManager.prototype.add = function (obj) {
  var self = this
  var session

  if (obj instanceof ClientSession) {
    session = obj
  } else if (this.canAdapt(obj)) {
    session = this.adapt(obj)
  } else {
    throw new TypeError('No adapter found for ' + obj)
  }

  if (this.has(session.id)) {
    log.info('Attemping to add duplicate session id:', session.id)
    return session
  }

  this.sessions.set(session.id, session)
  session.once('end', function () {
    self.sessions.delete(session.id)
    self.emit('end', session)
  })
  return session
}

SessionManager.prototype.has = function (id) {
  return this.sessions.has(id)
}

SessionManager.prototype.length = function () {
  return this.sessions.size
}

SessionManager.prototype.get = function (id) {
  return this.sessions.get(id)
}

// (Any) => Boolean
SessionManager.prototype.canAdapt = function (obj) {
  return this.adapters.some(function (adapter) {
    return adapter.canAdapt(obj)
  })
}

// (Any) => ClientSession?
SessionManager.prototype.adapt = function (obj) {
  var adapter = _.find(this.adapters, function (adapter) {
    return adapter.canAdapt(obj)
  })
  log.info('Adapting ClientSession with ' + nameOf(adapter))
  var adapted = adapter && adapter.adapt(obj)
  return adapted || null
}

function nameOf (obj) {
  if (obj && obj.name) {
    return obj.name
  }
  if (obj && obj.constructor && obj.constructor.name) {
    return obj.constructor.name
  }
  return String(obj)
}

module.exports = SessionManager
