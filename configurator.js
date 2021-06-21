/*
 * Configurator: Handles configuration for the Radar server.
 *
 * It provides the default configuration.
 * For each allowed variable, it provides a default, which can be overwritten
 * through ENV or ARGV
 *
 * All the knowledge of what comes in, belongs here
 *
 * ARGV > ENV > DEFAULTS
 *
 */
/* eslint-disable node/no-deprecated-api */

// Minimal radar settings
const defaultSettings = [
  {
    name: 'port',
    description: 'port to listen',
    env: 'RADAR_PORT',
    abbr: 'p',
    full: 'port',
    default: '8000'
  },
  {
    name: 'redisUrl',
    description: 'Redis url',
    env: 'RADAR_REDIS_URL',
    abbr: 'r',
    full: 'redis_url',
    default: 'redis://localhost:6379'
  },
  {
    name: 'sentinelMasterName',
    description: 'sentinel master name',
    env: 'RADAR_SENTINEL_MASTER_NAME',
    full: 'sentinel_master_name'
  },
  {
    name: 'sentinelUrls',
    description: 'sentinel urls',
    env: 'RADAR_SENTINEL_URLS',
    full: 'sentinel_urls'
  }
]

const Configurator = function (settings) {
  this.settings = clone(defaultSettings)

  if (settings) {
    const self = this
    settings.forEach(function (setting) {
      self.settings.push(clone(setting))
    })
  }
}

// Class methods

// Creates a Configurator and returns loaded configuration
Configurator.load = function () {
  const configurator = new Configurator()
  const configuration = configurator.load.apply(configurator, arguments)

  return configuration
}

// Instance methods

Configurator.prototype.load = function () {
  const self = this
  const options = (arguments.length === 1 ? arguments[0] : {})
  const cli = this._parseCli((options.argv || process.argv))
  const env = this._parseEnv((options.env || process.env))
  const config = this._defaultConfiguration()

  merge(config, options.config)

  this.settings.forEach(function (variable) {
    config[variable.name] = self._pickFirst(variable.name, cli, env, config)
  })

  if (options.persistence) {
    config.persistence = self._forPersistence(config)
  }

  return config
}

// Private instance methods

Configurator.prototype._parseCli = function (argv) {
  const parser = require('@gerhobbelt/nomnom')()

  this.settings.forEach(function (element) {
    parser.option(element.name, {
      help: element.description,
      full: element.full,
      abbr: element.abbr
    })
  })

  return parser.parse(argv)
}

Configurator.prototype._parseEnv = function (env) {
  const cleanEnv = {}
  let value

  this.settings.forEach(function (element) {
    value = env[element.env]
    if (value) {
      cleanEnv[element.name] = value
    }
  })

  return cleanEnv
}

Configurator.prototype._defaultConfiguration = function () {
  const config = {}

  this.settings.forEach(function (element) {
    if (Object.prototype.hasOwnProperty.call(element, 'default')) {
      config[element.name] = element.default
    }
  })

  return config
}

Configurator.prototype._pickFirst = function (propName) {
  const values = [].slice.call(arguments, 1)
  let i = 0
  let value = null

  while (!value && i <= values.length) {
    if (values[i] && values[i][propName]) {
      value = values[i][propName]
    }
    i++
  }

  return value
}

Configurator.prototype._forPersistence = function (configuration) {
  let connection

  // Using sentinel
  if (configuration.sentinelMasterName) {
    if (!configuration.sentinelUrls) {
      throw Error('sentinelMasterName present but no sentinelUrls was provided. ')
    }

    connection = {
      id: configuration.sentinelMasterName
    }

    connection.sentinels = configuration.sentinelUrls
      .split(',')
      .map(parseUrl)
  } else { // Using standalone redis
    connection = parseUrl(configuration.redisUrl)
  }

  return {
    use_connection: 'main',
    connection_settings: {
      main: connection
    }
  }
}

// Private methods
// TODO: Move to Util module, or somewhere else

function parseUrl (redisUrl) {
  const parsedUrl = require('url').parse(redisUrl)
  const config = {
    host: parsedUrl.hostname,
    port: parsedUrl.port
  }

  if (parsedUrl.auth) {
    // the password part of user:pass format
    config.redis_auth = parsedUrl.auth.substr(parsedUrl.auth.indexOf(':') + 1)
  }
  return config
}

function merge (destination, source) {
  for (const name in source) {
    if (Object.prototype.hasOwnProperty.call(source, name)) {
      destination[name] = source[name]
    }
  }

  return destination
}

function clone (object) {
  return JSON.parse(JSON.stringify(object))
}

module.exports = Configurator
