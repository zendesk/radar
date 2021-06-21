const async = require('async')

const Middleware = {
  use: function (middleware) {
    this._middleware = this._middleware || []
    this._middleware.push(middleware)
  },

  runMiddleware: function () {
    const context = arguments[0]
    const args = [].slice.call(arguments, 1, -1)
    const callback = [].slice.call(arguments, -1)[0]

    if (!this._middleware) {
      callback()
      return
    }

    const process = function (middleware, next) {
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
