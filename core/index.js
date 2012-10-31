module.exports = {
  Persistence: require('./lib/persistence.js'),
  Resource: require('./lib/resource.js'),
  Type: require('./lib/type.js'),
  Map: require('./lib/map.js'),

  MessageList: require('./lib/resources/message_list.js'),
  Presence: require('./lib/resources/presence'),
  Status: require('./lib/resources/status.js')
};
