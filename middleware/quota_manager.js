var MiniEventEmitter = require('miniee'),
    QuotaLimiter = require('./quota_limiter.js'),
    Client = require('../client/client.js'),
    logging = require('minilog')('radar:quota_manager');

var QuotaManager = function() { 
  this._limiters = {};
};

MiniEventEmitter.mixin(QuotaManager);

QuotaManager.prototype.checkLimits = function(socket, message, messageType, next) {
  var limiter = this.getLimiter(messageType),
      softLimit;

  if (!limiter || (message.op !== 'subscribe' && message.op !== 'sync')) {
    next();
  } else if (limiter.isAboveLimit(socket.id)) {
    logging.warn('#socket.message - rate_limited', message, socket.id);

    socket.send({
      op: 'err',
      value: 'rate limited',
      origin: message
    });

    next(new Error('limit reached'));
  } else {
    // Log Soft Limit, if available. 
    softLimit = this._getSoftLimit(messageType);
    if (softLimit && limiter.count(socket.id) === softLimit) {
      var client = Client.get(socket.id);
      this._logLimits(client, softLimit, rateLimiter.count(socket.id));
    }

    next();
  }
};

QuotaManager.prototype.updateLimits = function(socket, resource, message, messageType, next) {
  var limiter = this.getLimiter(messageType);

  if (limiter) {
    switch(message.op) {
      case 'sync':
      case 'subscribe': 
        limiter.add(socket.id, message.to);
        break;
      case 'unsubscribe': 
        limiter.remove(socket.id, message.to);
        break;
    }
  }

  next();
};

QuotaManager.prototype.destroyByClient = function(socket, resource, messageType, next) {
  var limiter = this.findLimiter(messageType);

  if (limiter) {
    limiter.remove(socket.id, resource.to);
  }

  next();
};

QuotaManager.prototype.destroyByResource = function(resource, messageType, next) {
  var to = resource.to,
      limiter = this.findLimiter(messageType);

  if (limiter) {
    limiter.removeByTo(to);
  }

  next();
};

QuotaManager.prototype.findLimiter = function(messageType) {
  return this._limiters[messageType.name];
};

QuotaManager.prototype.getLimiter = function(messageType) {
  var limiter = this.findLimiter(messageType);

  if (!limiter && this._shouldLimit(messageType)) {
    limiter = this._buildLimiter(messageType);
    this._limiters[messageType.name] = limiter;
    this.emit('rate_limiter:add', messageType.name, limiter);
  }
  
  return limiter;
};

QuotaManager.prototype._buildLimiter = function(messageType) {
  var limiter;

  if (this._shouldLimit(messageType)) {
    limiter = new QuotaLimiter(messageType.policy.limit);
  }

  return limiter;
};

QuotaManager.prototype._should = function(type, messageType) {
  return messageType && messageType.policy && messageType.policy[type];
};

QuotaManager.prototype._shouldLimit = function(messageType) {
  return this._should('limit', messageType);
};

QuotaManager.prototype._shouldSoftLimit = function(messageType) {
  return this._should('softLimit', messageType);
};

QuotaManager.prototype._getSoftLimit = function(messageType) {
  var softLimit;

  if (this._shouldSoftLimit(messageType)) {
    softLimit = messageType.policy.softLimit;
  }

  return softLimit;
};

QuotaManager.prototype._logLimits = function(client, expected, actual) {
  if (!client) {
    logging.error('Attempted to log client limits but no client was provided');
    return;
  }

  logging.warn('#socket.message - rate soft limit reached', client.id, {
    name: client.name, 
    actual: actual,
    expected: expected,
    subscriptions: client.subscriptions,
    presences: client.presences
  });
};

/* Middleware api */ 
QuotaManager.prototype.onMessage = QuotaManager.prototype.checkLimits;
QuotaManager.prototype.onResource = QuotaManager.prototype.updateLimits;
QuotaManager.prototype.onDestroyResource = QuotaManager.prototype.destroyByResource;
QuotaManager.prototype.onDestroyClient = QuotaManager.prototype.destroyByClient;

module.exports = QuotaManager;
