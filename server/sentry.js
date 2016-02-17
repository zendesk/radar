var _ = require('underscore')
var Minilog = require('minilog')
var logging = Minilog('radar:sentry')
var Persistence = require('persistence')
var redisSentriesKey = 'sentry:/radar'
var id = require('../core/id')

var defaultOptions = {
  EXPIRY_OFFSET: 60 * 1000, // 1 minute max valid time for an sentry message
  REFRESH_INTERVAL: 10000, // 10 seconds to refresh own sentry
  CHECK_INTERVAL: 30000 // 30 seconds to check for new sentries
}

var parseJSON = function (message) {
  try {
    return JSON.parse(message)
  } catch (e) {}
}

var messageIsExpired = function (message) {
  return (!message || !message.expiration || (message.expiration <= Date.now()))
}

var messageExpiration = function (message) {
  return (message && message.expiration && (message.expiration - Date.now()))
}

var Sentry = function (name) {
  this.sentries = {}
  this._setName(name)

  this._expiryOffset = defaultOptions.EXPIRY_OFFSET
  this._refreshInterval = defaultOptions.REFRESH_INTERVAL
  this._checkInterval = defaultOptions.CHECK_INTERVAL
}

require('util').inherits(Sentry, require('events').EventEmitter)

Sentry.prototype.start = function (options, callback) {
  var self = this
  var keepAliveOptions = {}
  var upMessage

  options = options || {}

  if (typeof (options) === 'function') {
    callback = options
  } else {
    this._applyOptions(options)
  }

  if (this._refreshTimer) { return }

  logging.info('#presence - #sentry - starting', this.name)

  if (options.expiration) {
    keepAliveOptions.expiration = options.expiration
  }

  upMessage = self._keepAlive(keepAliveOptions)

  this._loadAndCleanUpSentries(function () {
    self.emit('up', self.name, upMessage)
    Persistence.publish(redisSentriesKey, upMessage)
    self._startListening()
    if (callback) { callback() }
  })

  this._refreshTimer = setTimeout(this._refresh.bind(this), Math.floor(this._refreshInterval))
  this._checkSentriesTimer = setTimeout(this._checkSentries.bind(this), Math.floor(this._checkInterval))
}

Sentry.prototype.stop = function (callback) {
  logging.info('#presence- #sentry stopping', this.name)

  this._stopTimer('_checkSentriesTimer')
  this._stopTimer('_refreshTimer')
  this.sentries = {}
  this._stopListening()

  if (callback) { callback() }
}

Sentry.prototype.sentryNames = function () {
  return Object.keys(this.sentries)
}

Sentry.prototype.isDown = function (name) {
  var lastMessage = this.sentries[name]
  var isSentryDown = messageIsExpired(lastMessage)

  if (isSentryDown) {
    var text = this.messageExpirationText(lastMessage)

    logging.debug('#presence - #sentry isDown', name, isSentryDown, text)
  }

  return isSentryDown
}

Sentry.prototype.messageExpirationText = function (message) {
  var expiration = messageExpiration(message)
  var text = expiration ? expiration + '/' + this._expiryOffset : 'not-present'

  return text
}

Sentry.prototype._setName = function (name) {
  this.name = name || id()
  return this.name
}

Sentry.prototype._applyOptions = function (options) {
  if (options) {
    this.host = options.host
    this.port = options.port

    this._expiryOffset = options.expiryOffset || defaultOptions.EXPIRY_OFFSET
    this._refreshInterval = options.refreshInterval || defaultOptions.REFRESH_INTERVAL
    this._checkInterval = options.checkInterval || defaultOptions.CHECK_INTERVAL
  }
}

Sentry.prototype._keepAlive = function (options) {
  options = options || {}
  var message = this._newKeepAliveMessage(options.name, options.expiration)
  var name = message.name

  this.sentries[name] = message

  if (options.save !== false) {
    Persistence.persistHash(redisSentriesKey, name, message)
  }

  return message
}

Sentry.prototype._newKeepAliveMessage = function (name, expiration) {
  return {
    name: (name || this.name),
    expiration: (expiration || this._expiryOffsetFromNow()),
    host: this.host,
    port: this.port
  }
}

Sentry.prototype._expiryOffsetFromNow = function () {
  return Date.now() + this._expiryOffset
}

// It loads the sentries from redis, and performs two tasks:
//
// * purges sentries that are no longer available
// * expire sentries based on stale messages.
//
Sentry.prototype._loadAndCleanUpSentries = function (callback) {
  var self = this

  Persistence.readHashAll(redisSentriesKey, function (replies) {
    replies = replies || {}
    var repliesKeys = Object.keys(replies)

    self._purgeGoneSentries(replies, repliesKeys)

    repliesKeys.forEach(function (name) {
      self.sentries[name] = replies[name]
      if (self.isDown(name)) {
        self._purgeSentry(name)
      }
    })

    if (callback) { callback() }
  })
}

Sentry.prototype._purgeSentry = function (name) {
  var lastMessage

  Persistence.deleteHash(redisSentriesKey, name)

  lastMessage = this.sentries[name]
  logging.info('#presence - #sentry down:', name, lastMessage.host, lastMessage.port)
  delete this.sentries[name]
  this.emit('down', name, lastMessage)
}

// Deletion of a gone sentry key might just happened, so
// we compare existing sentry names to reply names
// and clear whatever we have that no longer exists.
Sentry.prototype._purgeGoneSentries = function (replies, repliesKeys) {
  var self = this
  var sentriesGone = _.difference(this.sentryNames(), repliesKeys)

  sentriesGone.forEach(function (name) {
    self._purgeSentry(name)
  })
}

// Listening for new pub sub messages from redis.
// As of now, we only care about new sentries going online.
// Everything else gets inferred based on time.
Sentry.prototype._startListening = function () {
  var self = this

  if (!this._listener) {
    this._listener = function (channel, message) {
      if (channel !== redisSentriesKey) {
        return
      }
      self._saveMessage(parseJSON(message))
    }

    Persistence.pubsub().subscribe(redisSentriesKey)
    Persistence.pubsub().on('message', this._listener)
  }
}

Sentry.prototype._stopListening = function () {
  if (this._listener) {
    Persistence.pubsub().unsubscribe(redisSentriesKey)
    Persistence.pubsub().removeListener('message', this._listener)
    delete this._listener
  }
}

Sentry.prototype._saveMessage = function (message) {
  if (message && message.name) {
    logging.debug('#presence - sentry.save', message.name, messageExpiration(message))
    this.sentries[message.name] = message
  }
}

Sentry.prototype._refresh = function () {
  var interval = Math.floor(this._refreshInterval)

  logging.info('#presence - #sentry keep alive:', this.name)
  this._keepAlive()
  this._refreshTimer = setTimeout(this._refresh.bind(this), interval)
}

Sentry.prototype._checkSentries = function () {
  var interval = Math.floor(this._checkInterval)

  if (!this.isTilted()) {
    logging.info('#presence - #sentry checking sentries:', this.name)
    this._loadAndCleanUpSentries()
  }

  this._lastChecked = Date.now()
  this._checkSentriesTimer = setTimeout(this._checkSentries.bind(this), interval)
}

// tilt mode: based on http://redis.io/topics/sentinel#tilt-mode
// before recognizing a remote sentry as down,
// make sure we trust our own observations by checking for clock skew.
// since sentry checking is based on time, we need to be sure our own sense of
// time is not distorted by blocking event loop lag by making sure this check is
// happening when it was scheduled to
Sentry.prototype.isTilted = function () {
  // tilted if we missed the check interval by more than 1 second
  return (Date.now() - this._lastChecked) > (this._checkInterval + 1000)
}

Sentry.prototype._stopTimer = function (methodName) {
  if (this[methodName]) {
    clearTimeout(this[methodName])
    delete this[methodName]
  }
}

module.exports = Sentry
module.exports.channel = redisSentriesKey
