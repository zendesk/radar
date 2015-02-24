var https = require('https'),
    http = require('http'),
    qs = require('querystring'),
    urlmodule = require('url'),

    logging = require('minilog')('client');

function Scope(defaults) {
  // Clone Client.def. We don't want to change the defaults when we modify options further.
  this.defaults = JSON.parse(JSON.stringify(defaults));
}

Scope.prototype.get = function(path) {
  var c = new Client();
  // Note: assigning this.defaults to c.options will still cause issues!
  // The problem is that since we modify c.options when forming requests
  // we would end up modifying the defaults values as well.
  // JSON.parse(JSON.stringify) is just used as a lazy way to create a deep copy
  c.options = JSON.parse(JSON.stringify(this.defaults));
  c.set('method', 'GET')
   .set('path', path);
  return c;
};

Scope.prototype.post = function(path) {
  var c = new Client();
  c.options = JSON.parse(JSON.stringify(this.defaults));
  c.set('method', 'POST')
   .set('path', path);
  return c;
};


function Client() {
  this.options = { headers: {}, secure: false };
}

Client.prototype.set = function(key, value) {
  this.options[key] = value;
  return this;
};

Client.prototype.header = function(key, value) {
  this.options.headers || (this.options.headers = {});
  this.options.headers[key] = value;
  return this;
};

Client.prototype.data = function(data) {
  if (this.options.method == 'GET') {
    // Append to QS
    logging.debug('GET append', data);
    this.options.path += '?'+qs.stringify(data);
  } else {
    // JSON encoding
    this.options.headers || (this.options.headers = {});
    this.options.headers['Content-Type'] = 'application/json';
    this.options.data = JSON.stringify(data);
    this.options.headers['Content-Length'] = this.options.data.length;
  }
  return this;
};

Client.prototype.end = function(callback) {
  this.options.redirects = 0;
  this._end(callback);
};

Client.prototype._end = function(callback) {
  var self = this,
      options = this.options,
      secure = this.options.secure,
      res_data = '',
      protocol = (secure ? https : http);

  if (this.beforeRequest) {
    this.beforeRequest(this);
  }

  logging.info('New API Request. Sending a '+(secure ? 'https ' : 'http')+'request. Options: ', options);

  var proxy = protocol.request(options, function(response) {
    response.on('data', function(chunk) { res_data += chunk; });
    response.on('end', function() {
      var err,
          isRedirect = Math.floor(response.statusCode / 100) == 3 && response.headers && response.headers.location;

      logging.debug('Response for the request "'+options.method+' '+options.host + options.path+'" has been ended.');

      if (isRedirect && self.options.redirects == 0) {
        logging.debug('Redirect to: ', response.headers.location);
        return self._redirect(response);
      }

      if (response.headers['content-type'] && response.headers['content-type'].toLowerCase().indexOf('application/json') > -1 ) {
        try {
          res_data = JSON.parse(res_data);
        } catch(jsonParseError) {
          return self._error(jsonParseError, res_data, callback);
        }
      }

      // Detect errors
      if (response.statusCode >= 400) {
        return self._error(new Error('Unexpected HTTP status code ' +response.statusCode), res_data, callback);
      } else if (res_data == '') {
        return self._error(new Error('Response was empty.'), res_data, callback);
      }

      logging.info('The request "'+options.method+' '+options.host + options.path+'" has been responded successfully.');
      logging.debug('Response body: ', res_data);

      callback && callback(undefined, res_data);
    });
  }).on('error', function(err) { self._error(err, callback); });

  if (options.data && options.method != 'GET') {
    proxy.write(options.data);
  }

  proxy.end();
};

Client.prototype._error = function(error, res_data, callback) {
  logging.error('#api_error An Error occured', error, 'Received response: <res>'+res_data+'</res>');
  callback && callback(error, res_data);
};

Client.prototype._redirect = function(response) {
  var parts;
  if (!/^https?:/.test(response.headers.location)) {
    response.headers.location = urlmodule.resolve(options.url, response.headers.location);
  }

  // Parse location to check for port
  parts = urlmodule.parse(response.headers.location);
  if (parts.protocol == 'http:') {
    options.secure = false;
    options.port = parts.port || 80;
  }

  this.options.url = parts.href;
  this._end(callback);
};

module.exports = Scope;
