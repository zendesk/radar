var log = require('minilog')('radar:auth'),
    Type = require('./type.js');

function Auth () { }

Auth.authorize = function (message, client, Core) {
  var rtn = true;

  var options = Type.getByExpression(message.to);
  if (options) {
    var provider = options && options.authProvider;
    if (provider && provider.authorize) {
      rtn = provider.authorize(options, message, client);
    }
  }
  else {
    log.info('#authorize: type not defined for name:', message.to);
  }

  return rtn;
};

module.exports = Auth;
