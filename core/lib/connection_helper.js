var Connection = require('./connection.js');

var connections = {};

function ConnectionHelper() {
}

ConnectionHelper.connection = function(name, config) {
  var connection = connections[name];

  if(!connection) {
    connection = new Connection(name, config);
    connections[name] = connection;
  }
  return connection;
};


ConnectionHelper.destroyConnection = function(name, done) {
  var connection = connections[name];
  if (!connection || connection.name) {
    return;
  }

  connection.teardown(function() {
    delete connections[connection.name];
    done();
  });
};

module.exports = ConnectionHelper;
