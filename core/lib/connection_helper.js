var Connection = require('./connection.js');

var connections = {};

function ConnectionHelper() {
}

ConnectionHelper.parse = function(configuration) {
  var config = {}, name = 'default';

  if(!configuration) {
    throw new Error("No configuration provided");
  }

  if(configuration.use_connection) {
    name = configuration.use_connection;
    config = configuration.connection_settings && configuration.connection_settings[name];
    if(!config) {
      throw new Error("No connection_settings provided: "+configuration  + " use_connection: "+ name);
    }
  } else {
    //legacy style
    config.host = configuration.redis_host || 'localhost';
    config.port = configuration.redis_port || 6379;
  }
  return { name: name, config: config };
};

ConnectionHelper.connection = function(configuration) {
  var parsed = ConnectionHelper.parse(configuration);

  var connection = connections[parsed.name];

  if(!connection) {
    connection = new Connection(parsed.name, parsed.config);
    connections[parsed.name] = connection;
  }
  return connection;
};

ConnectionHelper.destroyConnection = function(configuration, done) {
  var name = ConnectionHelper.parse(configuration).name;
  var connection = connections[name];
  if (!connection || connection.name)
    return;

  connection.teardown(function() {
    delete connections[connection.name];
    done();
  });
};

module.exports = ConnectionHelper;
