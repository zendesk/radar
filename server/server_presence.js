var Core = require('../core'),
    logging = require('minilog')('server:server_presence');

var RADAR_SERVER_EXPIRY = 15*1000,
    scope, port, heartbeat;

function keepAlive() {
  var scope = server_presence_scope(port);

  logging.info("keep-alive ", scope, new Date());
  Core.Persistence.persistHash(scope, 'last_seen_at', Date.now());
  Core.Persistence.expire(scope, 2*RADAR_SERVER_EXPIRY/1000);
}

function server_presence_scope() {
  if(!scope) {
    scope = 'radar_server_presence:/';
    scope += require('os').hostname() + '/';
    scope += port;
    logging.info("Got new scope: ",scope);
  }
  return scope;
}

module.exports = {
  server_expiry_scope: server_presence_scope,
  setup: function(config_port) {
    logging.info("Setting up keep-alive");
    port = config_port;
    keepAlive();
    heartbeat = setInterval(keepAlive, RADAR_SERVER_EXPIRY);
  },
  heartbeat: heartbeat
}
