var Resource = require('./resources/resource')
var MessageList = require('./resources/message_list')
var Presence = require('./resources/presence')
var Status = require('./resources/status')
var Stream = require('./resources/stream')

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
