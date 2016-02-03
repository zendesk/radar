var log = require('minilog')('radar:session_manager')
var ClientSession = require('../client/client_session')
var EventEmitter = require('events').EventEmitter
var inherits = require('util').inherits
var ObservableMap = require('observable-map')
var _ = require('underscore')

function SessionManager (opt) {
  var self = this
  this.sessions = new ObservableMap()
  this.sessions.on('change', function (event) {
    self.emit('change', event)
  })

  this.adapters = opt && opt.adapters || []
}
inherits(SessionManager, EventEmitter)

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
    return this
  }

  this.sessions.set(session.id, session)
  session.once('end', function () {
    self.sessions.delete(session.id)
    self.emit('end', session)
  })
  return this
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
  return adapter && adapter.adapt(obj) || null
}

module.exports = SessionManager
