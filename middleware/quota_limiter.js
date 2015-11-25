var logging = require('minilog')('radar:rate_limiter')
var MiniEventEmitter = require('miniee')

var QuotaLimiter = function (limit) {
  this._limit = limit
  this._resources = {
    id: {},
    to: {}
  }
}

MiniEventEmitter.mixin(QuotaLimiter)

QuotaLimiter.prototype.add = function (id, to) {
  if (!this._isNewResource(id, to)) {
    return false
  }

  if (this.isAboveLimit(id)) {
    this.emit('rate:limit', this._stateForId(id, to))
    logging.warn('rate limiting client: ' + id + ' to: ' + to)
    return false
  }

  this._add(id, to)
  this.emit('rate:add', this._stateForId(id, to))

  return true
}

QuotaLimiter.prototype.remove = function (id, to) {
  if (this._resources.id[id] && this._resources.to[to]) {
    delete this._resources.id[id][to]
    delete this._resources.to[to][id]
    this.emit('rate:remove', this._stateForId(id, to))
  }
}

QuotaLimiter.prototype.isAboveLimit = function (id, limit) {
  limit = limit || this._limit
  return this.count(id) >= limit
}

QuotaLimiter.prototype.countAll = function () {
  var counts = {}
  var self = this

  Object.keys(this._resources.id).forEach(function (id) {
    counts[id] = self.count(id)
  })

  return counts
}

QuotaLimiter.prototype.count = function (id) {
  var resources = this._getResourcesByType('id', id)
  return (resources ? Object.keys(resources).length : 0)
}

QuotaLimiter.prototype.removeById = function (id) {
  this.emit('rate:remove_by_id', this._stateForId(id))
  this._removeByType('id', 'to', id)
}

QuotaLimiter.prototype.removeByTo = function (to) {
  this.emit('rate:remove_by_to', this._stateForId(undefined, to))
  this._removeByType('to', 'id', to)
}

QuotaLimiter.prototype._removeByType = function (type1, type2, key) {
  this._deepRemove(type2, key, this._resources[type1][key], this._getResourcesByType)
  delete this._resources[type1][key]
}

QuotaLimiter.prototype.inspect = function () {
  return this._resources
}

QuotaLimiter.prototype._add = function (id, to) {
  this._addByType('id', id, to)
  this._addByType('to', to, id)
  return true
}

QuotaLimiter.prototype._addByType = function (type, key1, key2) {
  var resources = this._getResourcesByType(type, key1)

  if (!resources) {
    resources = this._initResourcesByType(type, key1)
  }

  resources[key2] = 1
}

QuotaLimiter.prototype._getResourcesByType = function (type, key) {
  return this._resources[type][key]
}

QuotaLimiter.prototype._initResourcesByType = function (type, key) {
  var resource = this._resources[type][key] = {}
  return resource
}

QuotaLimiter.prototype._isNewResource = function (id, to) {
  var resources = this._getResourcesByType('id', id)

  return !(resources && Object.keys(resources).indexOf(to) !== -1)
}

QuotaLimiter.prototype._deepRemove = function (type, key, results, lookup) {
  var self = this

  if (results && Object.keys(results).length > 0) {
    Object.keys(results).forEach(function (result) {
      var keys = lookup.call(self, type, result)

      if (keys) { delete keys[key] }
    })
  }
}
QuotaLimiter.prototype._stateForId = function (id, to) {
  return {
    id: id,
    to: to,
    limit: this._limit,
    count: this.count(id)
  }
}

module.exports = QuotaLimiter
