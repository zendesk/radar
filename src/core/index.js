const Resource = require('./resources/resource')
const MessageList = require('./resources/message_list')
const Presence = require('./resources/presence')
const Status = require('./resources/status')
const Stream = require('./resources/stream')

module.exports = {
  Persistence: require('persistence'),
  Type: require('./type.js'),
  PresenceManager: require('./resources/presence/presence_manager.js'),

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
}
