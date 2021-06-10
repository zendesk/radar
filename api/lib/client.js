/* eslint-disable node/no-deprecated-api */

const https = require('https')
const http = require('http')
const qs = require('querystring')
const urlmodule = require('url')
const logging = require('minilog')('client')

function Scope (defaults) {
  // Clone Client.def. We don't want to change the defaults when we modify options further.
  this.defaults = JSON.parse(JSON.stringify(defaults))
}

Scope.prototype.get = function (path) {
  const c = new Client()

  // Note: assigning this.defaults to c.options will still cause issues!
  // The problem is that since we modify c.options when forming requests
  // we would end up modifying the defaults values as well.
  // JSON.parse(JSON.stringify) is just used as a lazy way to create a deep copy
  c.options = JSON.parse(JSON.stringify(this.defaults))
  c.set('method', 'GET')
    .set('path', path)
  return c
}

Scope.prototype.post = function (path) {
  const c = new Client()

  c.options = JSON.parse(JSON.stringify(this.defaults))
  c.set('method', 'POST')
    .set('path', path)

  return c
}

function Client () {
  this.options = {
    headers: {},
    secure: false
  }
}

Client.prototype.set = function (key, value) {
  this.options[key] = value
  return this
}

Client.prototype.header = function (key, value) {
  this.options.headers = this.options.headers || {}
  this.options.headers[key] = value
  return this
}

Client.prototype.data = function (data) {
  if (this.options.method === 'GET') {
    // Append to QS
    logging.debug('GET append', data)
    this.options.path += '?' + qs.stringify(data)
  } else {
    // JSON encoding
    this.options.headers = this.options.headers || {}
    this.options.headers['Content-Type'] = 'application/json'
    this.options.data = JSON.stringify(data)
    this.options.headers['Content-Length'] = this.options.data.length
  }
  return this
}

Client.prototype.end = function (callback) {
  this.options.redirects = 0
  this._end(callback)
}

Client.prototype._end = function (callback) {
  const self = this
  const options = this.options
  const secure = this.options.secure
  let resData = ''
  const protocol = (secure ? https : http)

  if (this.beforeRequest) {
    this.beforeRequest(this)
  }

  logging.info('New API Request. Sending a ' +
    (secure ? 'https ' : 'http') +
    'request. Options: ', options)

  const proxy = protocol.request(options, function (response) {
    response.on('data', function (chunk) { resData += chunk })
    response.on('end', function () {
      const isRedirect = Math.floor(response.statusCode / 100) === 3 && response.headers && response.headers.location

      logging.debug('Response for the request "' + options.method + ' ' + options.host + options.path + '" has been ended.')

      if (isRedirect && self.options.redirects === 0) {
        logging.debug('Redirect to: ', response.headers.location)
        return self._redirect(response)
      }

      if (response.headers['content-type'] &&
        response.headers['content-type'].toLowerCase().indexOf('application/json') > -1) {
        try {
          resData = JSON.parse(resData)
        } catch (jsonParseError) {
          return self._error(jsonParseError, resData, callback)
        }
      }

      // Detect errors
      if (response.statusCode >= 400) {
        return self._error(new Error('Unexpected HTTP status code ' + response.statusCode), resData, callback)
      } else if (resData === '') {
        return self._error(new Error('Response was empty.'), resData, callback)
      }

      logging.info('The request "' +
        options.method + ' ' + options.host + options.path +
        '" has been responded successfully.')

      logging.debug('Response body: ', resData)

      if (callback) {
        callback(undefined, resData)
      }
    })
  }).on('error', function (err) { self._error(err, callback) })

  if (options.data && options.method !== 'GET') {
    proxy.write(options.data)
  }

  proxy.end()
}

Client.prototype._error = function (error, resData, callback) {
  logging.error('#api_error - An Error occured', error,
    'Received response: <res>' + resData + '</res>')

  if (callback) {
    callback(error, resData)
  }
}

Client.prototype._redirect = function (response, callback) {
  if (!/^https?:/.test(response.headers.location)) {
    response.headers.location = urlmodule.resolve(this.options.url, response.headers.location)
  }

  // Parse location to check for port
  const parts = urlmodule.parse(response.headers.location)
  if (parts.protocol === 'http:') {
    this.options.secure = false
    this.options.port = parts.port || 80
  }

  this.options.url = parts.href
  this._end(callback)
}

module.exports = Scope
