var logging = require('minilog')('radar:legacy_auth_manager')

// Legacy auth middleware
//
// This middleware adds support for the legacy authentication process.
//
// It checks for existance of an authProvider, and delegates
// authentication to it.
//
// {
//    type: '...',
//    name: '...',
//    authProvider: new MyAuthProvider()
// }

var LegacyAuthManager = function () {}

LegacyAuthManager.prototype.onMessage = function (clientSession, message, messageType, next) {
  if (!this.isAuthorized(clientSession, message, messageType)) {
    logging.warn('#clientSession.message - unauthorized', message, clientSession.id)
    console.log('auth', clientSession.constructor.name)
    clientSession.send({
      op: 'err',
      value: 'auth',
      origin: message
    })

    next(new Error('Unauthorized'))
  } else {
    next()
  }
}

LegacyAuthManager.prototype.isAuthorized = function (clientSession, message, messageType) {
  var isAuthorized = true
  var provider = messageType && messageType.authProvider

  if (provider && provider.authorize) {
    isAuthorized = provider.authorize(messageType, message, clientSession)
  }

  return isAuthorized
}

module.exports = LegacyAuthManager
