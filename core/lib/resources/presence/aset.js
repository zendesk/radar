var Set = require('../../map.js');

// Like a set, except the keys are managed as arrays.
// One can only push items to keys, and remove items from keys.
// Keys are only removed when all the items have been removed.
function ArraySet() {
  this._set = new Set();
}

ArraySet.prototype.push = function(key, item) {
  var value = this._set.get(key);
  if(!value) {
    this._set.add(key, [item]);
  } else if(value.indexOf(item) == -1){
    value.push(item);
    this._set.add(key, value);
  }
};

ArraySet.prototype.removeItem = function(key, item) {
  var value = this._set.get(key);
  if(value) {
    value = value.filter(function(v) {
      return v != item;
    });
    if (value.length == 0) {
      this._set.remove(key);
    } else {
      this._set.add(key, value);
    }
  }
};

ArraySet.prototype.hasKey = function(key) {
  return this._set.has(key);
};

ArraySet.prototype.keys = function() {
  return Object.keys(this._set.items);
};

ArraySet.prototype.getItems = function(key) {
  return this._set.get(key);
};

module.exports = ArraySet;
