/* 
 * Configurator: Handles configuration for the Radar server. 
 *
 * It provides the default configuration.
 * For each allowed variable, it provides a default, which can be overwritten 
 * through ENV or ARGV. 
 * 
 * All the knowledge of what comes in, belongs here. 
 * 
 * ARGV > ENV > DEFAULTS
 *
 */

// TODO: Move to Util module, or somewhere else. 
function merge(destination, source) {
  for (var name in source) {
    if (source.hasOwnProperty(name)) {
      destination[name] = source[name];
    }
  }

  return destination;
}

function clone(object) {
  return JSON.parse(JSON.stringify(object));
}
// Minimal radar settings. 
// Use it to enhance Configurator's knowledge, but do not remove anything. 
var defaultSettings = [
  {
    name:     'port', description: 'port to listen',
    env:      'RADAR_PORT', 
    abbr:     'p',
    full:     'port',
    default:  '8000'
  },
  {
    name:     'redisUrl', description: 'Redis url',
    env:      'RADAR_REDIS_URL',
    abbr:     'r',
    full:     'redis_url',
    default:  'redis://localhost:6379'
  },
  {
    name:     'healthReportInterval', description: 'healthReportInterval',
    env:      'RADAR_HEALTH_REPORT_INTERVAL',
    full:     'interval',
    abbr:     'i',
    default:  '10000'
  },
  {
    name:     'clientDataTTL', description: 'TTL for data stored on the server, in seconds (86400 = 1 day)',
    env:      'RADAR_CLIENT_DATA_TTL',
    full:     'client_data_ttl',
    default:  86400
  },
  {
    name:     'sentinelMasterName', description: 'sentinel master name',
    env:      'RADAR_SENTINEL_MASTER_NAME', 
    full:     'sentinel_master_name'
  },
  {
    name:     'sentinelUrls', description: 'sentinel urls',
    env:      'RADAR_SENTINEL_URLS',
    full:     'sentinel_urls'
  }
];

var Configurator = function(settings) {
  this.settings = clone(defaultSettings);
  
  if (settings) {
    var self = this;
    settings.forEach(function(setting) {
      self.settings.push(clone(setting));
    });
  }
};

// Creates a Configurator and returns loaded configuration. 
Configurator.load = function() {
  var configurator  = new Configurator(),
      configuration = configurator.load.apply(configurator, arguments);

  return configuration;
};

// Instance level methods
Configurator.prototype.load = function() {
  var options = (arguments.length === 1 ? arguments[0] : {}),
      cli =     this._parseCli((options.argv || process.argv)),
      env =     this._parseEnv((options.env  || process.env)),
      config =  this._defaultConfiguration();
  
  merge(config, options.config);

  this.settings.forEach(function(variable) {
    config[variable.name] = Configurator.pickFirst(variable.name, cli, env, config); 
  });

  if (options.persistence) {
    config.persistence = Configurator.forPersistence(config);
  }

  return config;
};

Configurator.prototype._parseCli = function(argv) {
  var parser = require('nomnom')();
  
  this.settings.forEach(function(element){
    parser.option(element.name, {
      help:     element.description, 
      full:     element.full,
      abbr:     element.abbr
    });
  });

  return parser.parse(argv);
};

Configurator.prototype._parseEnv = function(env) {
  var cleanEnv = {},
      value;

  this.settings.forEach(function(element){
    value = env[element.env];
    if (value) {
      cleanEnv[element.name] = value;
    }
  });

  return cleanEnv;
};

Configurator.prototype._defaultConfiguration = function() {
  var config = {};

  this.settings.forEach(function(element) {
    if (element.hasOwnProperty('default')) {
      config[element.name] = element.default;
    }
  });

  return config;
};

Configurator.pickFirst = function(propName) {
  var values = [].slice.call(arguments, 1),
      i = 0,
      value;

  while (!value && i <= values.length) {
    if (values[i] && values[i][propName]) {
      value = values[i][propName];
    }
    i++;
  }

  return value;
};

Configurator.forPersistence = function(configuration) {
  var url = require('url'), 
      connection;

  // Using sentinel
  if (configuration.sentinelMasterName) {
    if (!configuration.sentinelUrls) {
      throw Error('sentinelMasterName present but no sentinelUrls was provided. ');
    }
    
    connection = { id: configuration.sentinelMasterName, sentinels: []};

    var urls = configuration.sentinelUrls.split(',');
    urls.forEach(function(uri) {
      var parsedUrl = url.parse(uri);
      connection.sentinels.push({ 
        host: parsedUrl.hostname,
        port: parsedUrl.port
      });
    });
  } else { // Using standalone redis. 
    var parsedUrl = url.parse(configuration.redisUrl);
    connection = {
      host: parsedUrl.hostname,
      port: parsedUrl.port
    };
  }

  return { 
    use_connection: 'main', 
    connection_settings: {
      main: connection 
    } 
  };
};

module.exports = Configurator;
