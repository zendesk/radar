var Resource = require('./lib/resources/resource')
var MessageList = require('./lib/resources/message_list')
var Presence = require('./lib/resources/presence')
var Status = require('./lib/resources/status')
var Stream = require('./lib/resources/stream')

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
}
