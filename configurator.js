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

var variables = [
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

function defaultConfiguration() {
  var config = {};

  variables.forEach(function(element) {
    if (element.hasOwnProperty('default')) {
      config[element.name] = element.default;
    }
  });

  return config;
}

function parserCli(argv) {
  var parser = require('nomnom')();
  
  variables.forEach(function(element){
    parser.option(element.name, {
      help:     element.description, 
      full:     element.full,
      abbr:     element.abbr
    });
  });


  return parser.parse(argv);
}

function parserEnv(env) {
  var cleanEnv = {},
      value;

  variables.forEach(function(element){
    value = env[element.env];
    if (value) {
      cleanEnv[element.name] = value;
    }
  });

  return cleanEnv;
}

function pickFirst(propName) {
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
}

function forPersistence(configuration) {
  var connection, url = require('url');

  // Using sentinel
  if (configuration.sentinelMasterName) {
    if (!configuration.sentinelUrls) 
      throw Error('sentinelMasterName present but no sentinelUrls was provided. ');
    
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
  }
};

// TODO: Move to Util module, or somewhere. 
function merge(destination, source) {
  for (name in source) {
    if (source.hasOwnProperty(name))
      destination[name] = source[name];
  }
  return destination;
};

// Public
function load() {
  var options = (arguments.length == 1 ? arguments[0] : {}),
      cli = parserCli((options.argv || process.argv)),
      env = parserEnv((options.env  || process.env)),
      config = defaultConfiguration();
  
  merge(config, options.config || {});

  variables.forEach(function(variable) {
    config[variable.name] = pickFirst(variable.name, cli, env, config); 
  });

  if (options.persistence) {
    config.persistence = forPersistence(config);
  }

  return config;
}

module.exports = {
  load: load
};
