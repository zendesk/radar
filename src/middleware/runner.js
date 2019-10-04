var async = require('async')

var Middleware = {
  use: function (middleware) {
    this._middleware = this._middleware || []
    this._middleware.push(middleware)
  },

  runMiddleware: function () {
    var context = arguments[0]
    var args = [].slice.call(arguments, 1, -1)
    var callback = [].slice.call(arguments, -1)[0]

    if (!this._middleware) {
      callback()
      return
    }

    var process = function (middleware, next) {
      if (middleware[context]) {
        middleware[context].apply(middleware, args.concat(next))
      } else {
        next()
      }
    }

    async.each(this._middleware, process, callback)
  }
}

module.exports = {
  mixin: function (receiver) {
    for (const key in Middleware) {
      if (Object.prototype.hasOwnProperty.call(Middleware, key)) {
        receiver.prototype[key] = Middleware[key]
      }
    }
  }
}
