var id = require('./id')
var logging = require('minilog')('radar:stamper')
var sentryName

module.exports = {
  setup: function (name) {
    sentryName = name
  },

  stamp: function (message, clientId) {
    if (!sentryName) {
      logging.error('run Stamper.setup() before trying to stamp')
    }

    if (message.stamp && clientId) {
      message.stamp.clientId = clientId
    } else {
      message.stamp = {
        id: id(),
        clientId: clientId,
        sentryId: sentryName,
        timestamp: new Date().toJSON()
      }
    }

    return message
  }
}
