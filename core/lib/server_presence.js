var Persistence = require('./persistence.js'),
    logging = require('minilog')('server_presence');

var radarServerExpiry = 15*1000,
    serverPresenceId, port, heartbeat,
    prefix = 'radar_server_presence:/';

function keepAlive() {
  var scope = prefix + getServerPresenceId();

  logging.info("keep-alive ", scope, new Date());
  Persistence.persistHash(scope, 'last_seen_at', Date.now());
  Persistence.expire(scope, 2*radarServerExpiry/1000);
}

function getServerPresenceId() {
  if(!serverPresenceId) {
    serverPresenceId = require('os').hostname() + '/';
    serverPresenceId += port + '/';
    serverPresenceId += Date.now(); //Changes every restart
    logging.debug("Got new serverPresenceId: ",serverPresenceId);
  }
  return serverPresenceId;
}

function fetchServerPresence(id, callback) {
  Persistence.exists(prefix+id, callback);
}

module.exports = {
  getServerPresenceId: getServerPresenceId,
  setup: function(config_port) {
    logging.info("Setting up keep-alive");
    port = config_port;
    keepAlive();
    heartbeat = setInterval(keepAlive, radarServerExpiry);
  },
  fetchServerPresence: fetchServerPresence,
  heartbeat: heartbeat
}
