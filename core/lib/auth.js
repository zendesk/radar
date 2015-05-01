var log = require('minilog')('radar:auth'),
    Type = require('./type.js');

function Auth () { }

Auth.authorize = function (message, socket) {
  var isAuthorized = true;

  var options = Type.getByExpression(message.to);
  if (options) {
    var provider = options && options.authProvider;
    if (provider && provider.authorize) {
      isAuthorized = provider.authorize(options, message, socket);
    }
  }
  else {
    log.info('#authorize: type not defined for name:', message.to);
  }

  return isAuthorized;
};

module.exports = Auth;
