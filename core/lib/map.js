var RadarMap = function() {
  this.items = {};
  this.length = 0;
};

require('util').inherits(RadarMap, require('events').EventEmitter);

RadarMap.prototype.add = function(key, value) {
  // only increment if the key is undefined
  if(!this.has(key)) {
    this.length++;
    this.emit('add', key);
  }
  this.items[key] = (value !== undefined ? value : true);
};

RadarMap.prototype.has = function(key) {
  return Object.prototype.hasOwnProperty.call(this.items, key);
};

RadarMap.prototype.get = function(key) {
  return this.items[key];
};

RadarMap.prototype.remove = function(key) {
  // only decrement if the key was previously Map
  if(this.has(key)) {
    this.length--;
    this.emit('remove', key);
  }
  delete this.items[key];
};

RadarMap.prototype.empty = function() {
  this.items = {};
  this.length = {};
};

['filter', 'forEach', 'every', 'map', 'some'].forEach(function(name) {
  RadarMap.prototype[name] = function() {
    return Array.prototype[name].apply(Object.keys(this.items), arguments);
  };
});

module.exports = RadarMap;
