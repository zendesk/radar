var logging = require('minilog')('radar:legacy_auth_manager');

// Legacy auth middleware. 
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

var LegacyAuthManager = function() { };

LegacyAuthManager.prototype.onMessage = function(socket, message, messageType, next) {
  if (!this.isAuthorized(socket, message, messageType)) {
    logging.warn('#socket.message - auth_invalid', message, socket.id);

    socket.send({
      op: 'err',
      value: 'auth',
      origin: message
    });
    
    next(new Error('auth error'));
  } else {
    next();    
  }
};

LegacyAuthManager.prototype.isAuthorized = function(socket, message, messageType) {
  var isAuthorized = true,
      provider = messageType && messageType.authProvider;
  
  if (provider && provider.authorize) {
    isAuthorized = provider.authorize(messageType, message, socket);
  }

  return isAuthorized; 
};

module.exports = LegacyAuthManager;
