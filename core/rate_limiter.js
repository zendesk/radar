var logging = require('minilog')('radar:rate_limiter'),
    MiniEventEmitter = require('miniee');

var RateLimiter = function(limit) {
 this._limit = limit;
 this._resources = {
   id: {},
   name: {}
 };
};

MiniEventEmitter.mixin(RateLimiter);

RateLimiter.prototype.add = function(id, name) {
  if (!this._isNewResource(id, name)) {
    return false;
  }

  if (this.isAboveLimit(id)) {
    this.emit('rate:limited', this._stateForId(id, name));
    logging.warn('rate limiting client: ' + id + ' name: ' + name);
    return false;
  }

  this._add(id, name);
  this.emit('rate:add', this._stateForId(id, name));

  return true;
};

RateLimiter.prototype.remove = function(id, name) {
  delete this._resources.id[id][name];
  delete this._resources.name[name][id];
  this.emit('rate:remove', this._stateForId(id, name));
};

RateLimiter.prototype.isAboveLimit = function(id) {
  return this.count(id) >= this._limit;
};

RateLimiter.prototype.countAll = function() {
  var counts = {}, self = this;

  Object.keys(this._resources.id).forEach(function(id) {
    counts[id] = self.count(id);
  });

  return counts;
};

RateLimiter.prototype.count = function(id) {
  var resources = this._getResourcesByType('id', id);
  return (resources ? Object.keys(resources).length : 0);
};

RateLimiter.prototype.removeById = function(id) {
  this.emit('rate:remove_by_id', this._stateForId(id));
  this._removeByType('id', 'name', id);
};

RateLimiter.prototype.removeByName = function(name) {
  this.emit('rate:remove_by_name', this._stateForId(undefined, name));
  this._removeByType('name', 'id', name);
};

RateLimiter.prototype._removeByType = function(type1, type2, key) {
  this._deepRemove(type2, key, this._resources[type1][key], this._getResourcesByType);
  delete this._resources[type1][key];
};

RateLimiter.prototype.inspect = function() {
  return this._resources;
};

RateLimiter.prototype._add = function(id, name) {
  this._addByType('id', id, name);
  this._addByType('name', name, id);
  return true;
};

RateLimiter.prototype._addByType = function(type, key1, key2) {
  var resources = this._getResourcesByType(type, key1);

  if (!resources) {
    resources = this._initResourcesByType(type, key1);
  }

  resources[key2] = 1;
};

RateLimiter.prototype._getResourcesByType = function (type, key) {
  return this._resources[type][key];
};

RateLimiter.prototype._initResourcesByType = function (type, key) {
  var resource = this._resources[type][key] = {};
  return resource;
};

RateLimiter.prototype._isNewResource = function(id, name) {
  var resources = this._getResourcesByType('id', id);

  return !(resources && Object.keys(resources).indexOf(name) !== -1);
};

RateLimiter.prototype._deepRemove = function(type, key, results, lookup) {
  var self = this;

  if (results && Object.keys(results).length > 0) {
    Object.keys(results).forEach(function(result) {
      var keys = lookup.call(self, type, result);

      if (keys) { delete keys[key]; }
    });
  }
};
RateLimiter.prototype._stateForId = function(id, name) {
  return { 
    id: id, 
    name: name,
    limit: this._limit,
    count: this.count(id)
  };
};

module.exports = RateLimiter;
