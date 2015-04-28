var log = require('minilog')('radar:auth'),
    Type = require('./type.js');

function Auth () { }

Auth.authorize = function (message, socket) {
  var rtn = true;

  var options = Type.getByExpression(message.to);
  if (options) {
    var provider = options && options.authProvider;
    if (provider && provider.authorize) {
      rtn = provider.authorize(options, message, socket);
    }
  }
  else {
    log.info('#authorize: type not defined for name:', message.to);
  }

  return rtn;
};

module.exports = Auth;
