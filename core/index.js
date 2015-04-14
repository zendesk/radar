var Resource = require('./lib/resource.js'),
    MessageList = require('./lib/resources/message_list.js'),
    Presence = require('./lib/resources/presence'),
    Status = require('./lib/resources/status.js'),
    Stream = require('./lib/resources/stream/index.js');

module.exports = {
  Persistence: require('persistence'),
  Type: require('./lib/type.js'),
  PresenceManager: require('./lib/resources/presence/presence_manager.js'),
  Auth: require('./lib/auth.js'),

  Resource: Resource,
  MessageList: MessageList,
  Presence: Presence,
  Status: Status,
  Resources: {
    MessageList: MessageList,
    Presence: Presence,
    Status: Status,
    Stream: Stream
  }
};
