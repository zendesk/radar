var Resource = require('./lib/resources/resource'),
    MessageList = require('./lib/resources/message_list'),
    Presence = require('./lib/resources/presence'),
    Status = require('./lib/resources/status'),
    Stream = require('./lib/resources/stream');

module.exports = {
  Persistence: require('persistence'),
  Type: require('./lib/type.js'),
  PresenceManager: require('./lib/resources/presence/presence_manager.js'),

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
