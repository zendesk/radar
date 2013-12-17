/**
 * MiniEE is a client and server side library for routing events.
 * Main difference from EventEmitter is that callbacks can be specified using RegExps.
 */

var MiniEventEmitter	= function(){ };

MiniEventEmitter.prototype.each = function(obj, iterator, context) {
  var breaker = {};
  if (obj == null) return;
  if (Array.prototype.forEach && obj.forEach === Array.prototype.forEach) {
    obj.forEach(iterator, context);
  } else if (obj.length === +obj.length) {
    for (var i = 0, l = obj.length; i < l; i++) {
      if (i in obj && iterator.call(context, obj[i], i, obj) === breaker) return;
    }
  } else {
    for (var key in obj) {
      if (obj.hasOwnProperty(key)) {
        if (iterator.call(context, obj[key], key, obj) === breaker) return;
      }
    }
  }
};

MiniEventEmitter.prototype.filter = function(obj, iterator, context) {
  var results = [];
  if (obj == null) return results;
  if (Array.prototype.filter && obj.filter === Array.prototype.filter) return obj.filter(iterator, context);
  MiniEventEmitter.prototype.each(obj, function(value, index, list) {
    if (iterator.call(context, value, index, list)) results[results.length] = value;
  });
  return results;
};

MiniEventEmitter.prototype.on = function(expr, callback) {
  if(expr instanceof RegExp) {
    this._routes || (this._routes = []);
    this._routes.unshift([ expr, callback] );
  } else {
    this._events || (this._events = {});
    this._events[expr] || (this._events[expr] = []);
    this._events[expr].unshift( callback );
  }
  return this;
};

MiniEventEmitter.prototype.addListener = MiniEventEmitter.prototype.on;

MiniEventEmitter.prototype.once = function(event, callback) {
  var self = this;
  function removeAfter() {
    self.removeListener(event, removeAfter);
    callback.apply(this, arguments);
  }
  removeAfter.listener = callback;
  self.on(event, removeAfter);
  return this;
};

MiniEventEmitter.prototype.when = function(event, callback) {
  var self = this;
  function check() {
    if(callback.apply(this, arguments)) {
      self.removeListener(event, check);
    }
  }
  check.listener = callback;
  self.on(event, check);
  return this;
};

MiniEventEmitter.prototype.removeListener	= function(expr, callback){
  if(expr instanceof RegExp && this._routes) {
    this._routes = MiniEventEmitter.prototype.filter(this._routes, function(value) {
      return !(value[0].toString() == expr.toString() && (value[1] === callback ||
          // once() events are wrapped in a removeAfter
          (value[1].listener && value[1].listener === callback)
      ));
    });
  } else if(this._events && this._events[expr]) {
    this._events[expr] = MiniEventEmitter.prototype.filter(this._events[expr], function(value) {
      return !(value === callback ||
        (value.listener && value.listener === callback)
      );
    });
  }
  return this;
};

MiniEventEmitter.prototype.removeAllListeners = function(expr) {
  if(arguments.length === 0) {
    this._events = {};
    this._routes = [];
    return;
  }
  if(expr instanceof RegExp && this._routes) {
    this._routes = MiniEventEmitter.prototype.filter(this._routes, function(value) {
      return value[0].toString() != expr.toString();
    });
  } else if(this._events && this._events[expr]) {
    this._events[expr] = [];
  }
  return this;
};

MiniEventEmitter.prototype.emit = function(event /* arg .. */) {
  // check all routes for a match
  var args = Array.prototype.slice.call(arguments, 1), i;
  if(this._events && this._events[event]) {
    // must run in reverse order to ensure that removing events won't skip callbacks
    for(i = this._events[event].length-1; i > -1 && this._events[event] && this._events[event][i]; i--){
      this._events[event][i].apply(this, args);
    }
  }
  if(this._routes) {
    // must run in reverse order to ensure that removing events won't skip callbacks
    for(i = this._routes.length-1; i > -1; i--){
      if(this._routes[i][0].test(event)) {
        this._routes[i][1].apply(this, args);
      }
    }
  }
  return this;
};

MiniEventEmitter.mixin	= function(destObject){
	var props	= ['on', 'removeListener', 'removeAllListeners',  'emit', 'next', 'once', 'when'];
	for(var i = 0; i < props.length; i ++){
		destObject.prototype[props[i]]	= MiniEventEmitter.prototype[props[i]];
	}
};

(typeof module != 'undefined') && (module.exports = MiniEventEmitter);

