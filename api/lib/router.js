/* eslint-disable node/no-deprecated-api */

const url = require('url')
const logging = require('minilog')('radar:api-router')

function Router () {
  this.urlMap = []
}

// Route an incoming API request
Router.prototype.route = function (req, res) {
  logging.info('Routing request "' + req.method + ' ' + req.url + '"')

  const pathname = url.parse(req.url).pathname.replace(/^\/?node/, '')
  const len = this.urlMap.length
  let i = -1
  let urlHandler

  while (++i <= len) {
    if (this.urlMap[i] && this.urlMap[i].method === req.method && this.urlMap[i].re.test(pathname)) {
      urlHandler = this.urlMap[i]
      break
    }
  }

  if (!urlHandler) {
    return false
  }

  if (req.method === 'POST') {
    let data = ''

    req.on('data', function (chunk) {
      data += chunk
    })

    req.on('end', function () {
      logging.debug('Post data sent to ' + req.url + ' ended.')
      urlHandler.callback.apply(undefined, [req, res, urlHandler.re.exec(pathname), data])
    })
  } else {
    urlHandler.callback.apply(undefined, [req, res, urlHandler.re.exec(pathname)])
  }

  return true
}

Router.prototype.get = function (regexp, callback) {
  this.urlMap.push({ method: 'GET', re: regexp, callback: callback })
}

Router.prototype.post = function (regexp, callback) {
  this.urlMap.push({ method: 'POST', re: regexp, callback: callback })
}

Router.prototype.attach = function (httpServer) {
  const self = this

  // Cache and clean up listeners
  const oldListeners = httpServer.listeners('request')
  httpServer.removeAllListeners('request')

  // Add request handler
  httpServer.on('request', function (req, res) {
    if (!self.route(req, res)) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
      logging.info('Routing to old listeners')
      for (let i = 0, l = oldListeners.length; i < l; i++) {
        oldListeners[i].call(httpServer, req, res)
      }
    }
  })
}

module.exports = Router
