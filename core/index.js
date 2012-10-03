module.exports = {
  Persistence: require('./lib/persistence.js'),
  Resource: require('./lib/resource.js'),
  Type: require('./lib/type.js'),
  Map: require('./lib/map.js'),

  MessageList: require('./lib/resources/message_list.js'),
  Presence: require('./lib/resources/presence.js'),
  PresenceMonitor: require('./lib/presence_monitor.js'),
  PresenceMaintainer: require('./lib/presence_maintainer.js'),
  Status: require('./lib/resources/status.js')
};
