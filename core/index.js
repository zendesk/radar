var Resource = require('./lib/resource.js'),
    MessageList = require('./lib/resources/message_list.js'),
    Presence = require('./lib/resources/presence'),
    Status = require('./lib/resources/status.js');

module.exports = {
  Persistence: require('./lib/persistence.js'),
  Type: require('./lib/type.js'),
  Map: require('./lib/map.js'),
  RemoteManager: require('./lib/resources/presence/remote_manager'),

  Resource: Resource,
  MessageList: MessageList,
  Presence: Presence,
  Status: Status,
  Resources: {
    MessageList: MessageList,
    Presence: Presence,
    Status: Status,
  }
};
