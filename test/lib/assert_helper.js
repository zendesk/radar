const extend = require('lodash/extend')
const assert = require('assert')
const EE = require('events').EventEmitter
const Sentry = require('../../src/core/resources/presence/sentry.js')
const PresenceManager = require('../../src/core/resources/presence/presence_manager.js')
const SentryDefaults = {
  expiryOffset: 4000,
  refreshInterval: 3500,
  checkInterval: 5000
}

const clone = function (object) {
  return JSON.parse(JSON.stringify(object))
}

const presenceManagerForSentry = function (name, options, callbackFn) {
  const tempSentry = newTestSentry(name)
  const pm = new PresenceManager('presence:/dev/test', {}, tempSentry)

  options = options || {}

  if (typeof (options) !== 'object') {
    callbackFn = options
    options = {}
  }

  if (!options.dead) {
    tempSentry.start(options, function () {
      callbackFn(pm)
      tempSentry.stop()
    })
  } else {
    tempSentry._keepAlive(options)
    callbackFn(pm)
  }
}

var newTestSentry = function (name, options) {
  return new Sentry(name, options)
}

// Presence helper
function PresenceMessage (account, name) {
  this.scope = 'presence:/' + account + '/' + name
  this.notifications = []
  this.times = []

  const self = this
  this.notify = function (message) {
    self.notifications.push(message)
    self.times.push(Date.now())
    self.emit(self.notifications.length)
  }
}

require('util').inherits(PresenceMessage, EE)

PresenceMessage.prototype.teardown = function () {
  this.notifications = []
  this.removeAllListeners()
  delete this.client
  delete this.online_clients
}

PresenceMessage.prototype.fail_on_more_than = function (n) {
  this.on(n + 1, function () {
    assert.ok(false, 'more than ' + n + ' messages received')
  })
}

PresenceMessage.prototype.fail_on_any_message = function () {
  this.fail_on_more_than(0)
}

PresenceMessage.prototype.for_client = function (client) {
  if (client.configuration) {
    this.client = {
      userId: client.configuration('userId'),
      userType: client.configuration('userType'),
      userData: client.configuration('userData'),
      clientId: client.currentClientId()
    }
  } else {
    this.client = client
  }
  return this
}

PresenceMessage.prototype.assert_stamp = function (stamp) {
  assert(stamp)
  assert(stamp.id)
  assert(stamp.sentryId)
  assert(stamp.timestamp)
}

// user online:
// { to: "presence:/<account/<scope>",
//   op: "online",
//   value:{ <user_id> : <user_type> },
//   userData:  <user_data>
// }

PresenceMessage.prototype.assert_online = function (originalMessage) {
  const value = {}
  const client = this.client
  const message = clone(originalMessage)

  this.assert_stamp(message.stamp)
  delete message.stamp

  value[client.userId] = client.userType

  assert.deepStrictEqual({
    to: this.scope,
    op: 'online',
    value: value,
    userData: client.userData
  }, message)
}
// user offline:
// {
//   to: "presence:/<account>/<scope>",
//   op: "offline",
//   value: { <user_id>:<user_type> }
// }
PresenceMessage.prototype.assert_offline = function (originalMessage) {
  const value = {}
  const client = this.client
  const message = clone(originalMessage)

  this.assert_stamp(message.stamp)
  delete message.stamp

  value[client.userId] = client.userType

  assert.deepStrictEqual({
    to: this.scope,
    op: 'offline',
    value: value
  }, message)
}
// client_online:
// {
//   to:"presence:/<account>/<scope>,
//   op:"client_online",
//   value:{
//     userId: <user_id>,
//     clientId: <client_id>,
//     userData: <user_data>
//   }
// }
PresenceMessage.prototype.assert_client_online = function (originalMessage) {
  const client = this.client
  const message = clone(originalMessage)
  const value = {
    userId: client.userId,
    clientId: client.clientId,
    userData: client.userData
  }

  this.assert_stamp(message.stamp)
  delete message.stamp

  assert.deepStrictEqual({
    to: this.scope,
    op: 'client_online',
    value: value
  }, message)
}

PresenceMessage.prototype.assert_client_updated = function (originalMessage, clientData) {
  assert(clientData, 'client_updated is only triggered on new clientData. To assert it, you need to pass the expected clientData.')

  const client = this.client
  const message = clone(originalMessage)
  const value = {
    userId: client.userId,
    clientId: client.clientId,
    userData: client.userData,
    clientData: clientData
  }

  this.assert_stamp(message.stamp)
  delete message.stamp

  assert.deepStrictEqual({
    to: this.scope,
    op: 'client_updated',
    value: value
  }, message)
}
// client_offline:
// {
//   to:"presence:/<account>/<scope>,
//   op:"client_online",
//   explicit: true,
//   value:{
//     userId: <user_id>,
//     clientId: <client_id>,
//   }
// }
PresenceMessage.prototype.assert_client_offline = function (originalMessage, explicit) {
  const client = this.client
  const message = clone(originalMessage)
  const value = {
    userId: client.userId,
    clientId: client.clientId
  }

  this.assert_stamp(message.stamp)
  delete message.stamp

  assert.deepStrictEqual({
    to: this.scope,
    op: 'client_offline',
    explicit: explicit,
    value: value
  }, message)
}

PresenceMessage.prototype.assert_client_explicit_offline = function (message) {
  this.assert_client_offline(message, true)
}

PresenceMessage.prototype.assert_client_implicit_offline = function (message) {
  this.assert_client_offline(message, false)
}

PresenceMessage.prototype.assert_message_sequence = function (list, from) {
  let i
  let method
  let args
  const messages = this.notifications.slice(from)

  assert.strictEqual(messages.length, list.length, 'mismatch ' + list + ' in messages received : ' + JSON.stringify(messages))

  for (i = 0; i < messages.length; i++) {
    if (typeof (list[i]) === 'object') {
      method = 'assert_' + list[i][0]
      args = list[i][1]
    } else {
      method = 'assert_' + list[i]
    }

    this[method](messages[i], args)
  }
}

PresenceMessage.prototype.assert_onlines_received = function () {
  let j
  for (j = 0; j < this.online_clients.length; j++) {
    const client = this.online_clients[j]
    const uid = client.userId
    const cid = client.clientId
    const type = client.userType
    var i
    let onlineIdx = -1
    let clientOnlineIdx = -1

    for (i = 0; i < this.notifications.length; i++) {
      const value = this.notifications[i].value
      if (typeof value[uid] !== 'undefined' && value[uid] === type) {
        assert.strictEqual(onlineIdx, -1)
        onlineIdx = i
        this.for_client(client).assert_online(this.notifications[i])
      }
      if (value.userId === uid && value.clientId === cid) {
        assert.strictEqual(clientOnlineIdx, -1)
        clientOnlineIdx = i
        this.for_client(client).assert_client_online(this.notifications[i])
      }
    }
    assert.ok(onlineIdx !== -1)
    assert.ok(clientOnlineIdx !== -1)
    assert.ok(clientOnlineIdx > onlineIdx)
  }
}

PresenceMessage.prototype.for_online_clients = function () {
  const clients = Array.prototype.slice.call(arguments, 0)
  this.online_clients = []
  const self = this
  clients.forEach(function (client) {
    let clientHash = client
    if (client.configuration) {
      clientHash = {
        clientId: client.currentClientId(),
        userId: client.configuration('userId'),
        userData: client.configuration('userData'),
        userType: client.configuration('userType')
      }
    }
    self.online_clients.push(clientHash)
  })
  return this
}

// get response:
// { op:"get",
//   to:"presence:/<account>/<scope>",
//   value: {
//     <user_id>: <user_type>,
//     <user_id>: <user_type>
//   }
//  }
PresenceMessage.prototype.assert_get_response = function (message) {
  const clients = this.online_clients || []
  const value = {}

  clients.forEach(function (client) {
    value[client.userId] = client.userType
  })

  assert.deepStrictEqual({
    op: 'get',
    to: this.scope,
    value: value
  }, message)
}

// get v2 response:
// { op:"get",
//  to:"presence:/<account>/<scope>",
//  value: {
//    <user_id>: {
//      clients: {
//        <client_id>: <user_data>,
//        ...
//      },
//      userType: <user_type>
//    },
//   ...
//  }
// }
PresenceMessage.prototype.assert_get_v2_response = function (message, clientData) {
  const value = {}
  const clients = this.online_clients || []

  clients.forEach(function (client) {
    let userHash
    if (value[client.userId]) {
      userHash = value[client.userId]
    } else {
      value[client.userId] = userHash = { clients: {} }
    }

    userHash.userType = client.userType

    if (clientData) {
      userHash.clients[client.clientId] = extend({}, client.userData, clientData)
    } else {
      userHash.clients[client.clientId] = client.userData
    }
  })

  const expectedMessage = {
    op: 'get',
    to: this.scope,
    value: value
  }

  assert.deepStrictEqual(expectedMessage, message,
    JSON.stringify(expectedMessage) + ' vs ' + JSON.stringify(message))
}

// sync response:
// { op:"online",
//   to:"presence:/<account>/<scope>",
//   value: {
//     <user_id>: <user_type>,
//     <user_id>: <user_type>
//   }
//  }
PresenceMessage.prototype.assert_sync_response = function (message) {
  const clients = this.online_clients || []
  const value = {}

  clients.forEach(function (client) {
    value[client.userId] = client.userType
  })

  assert.deepStrictEqual({
    op: 'online',
    to: this.scope,
    value: value
  }, message)
}

// Sync v2 response: same as get v2
PresenceMessage.prototype.assert_sync_v2_response = PresenceMessage.prototype.assert_get_v2_response
// ack format
// { op: 'set/subscribe/unsubscribe',
//   to: 'presence:/<account>/<scope>',
//   ack: <ack number>,
//   userData: <user_data>
//
//   value: <online/offline>, //only for set
//   key: <user_id>, //only for set
//   type: <user_type>, //only for set
// }
PresenceMessage.prototype.assert_ack_for = function (type, message) {
  const expected = { to: this.scope }
  const ackNumber = message.ack
  delete message.ack

  switch (type) {
    case 'set_online':
    case 'set_offline':
      expected.op = 'set'
      expected.value = type.split('_')[1]
      expected.key = this.client.userId
      expected.type = this.client.userType
      break
    case 'subscribe':
    case 'unsubscribe':
      expected.op = type
      break
  }
  expected.userData = this.client.userData

  assert.deepStrictEqual(expected, message)
  assert.ok(ackNumber > 0)

  // Restore
  message.ack = ackNumber
}

PresenceMessage.prototype.assert_ack_for_set_online = function (message) {
  this.assert_ack_for('set_online', message)
}

PresenceMessage.prototype.assert_ack_for_set_offline = function (message) {
  this.assert_ack_for('set_offline', message)
}

PresenceMessage.prototype.assert_ack_for_subscribe = function (message) {
  this.assert_ack_for('subscribe', message)
}

PresenceMessage.prototype.assert_ack_for_unsubscribe = function (message) {
  this.assert_ack_for('unsubscribe', message)
}

// Timing of messages
PresenceMessage.prototype.assert_delay_between_notifications_within_range = function (i, j, low, high) {
  const delay = this.times[j] - this.times[i]
  assert.ok(low <= delay, 'delay(' + delay + ') was not >= ' + low)
  assert.ok(delay <= high, 'delay(' + delay + ') was not <= ' + high)
}

// Stream

function StreamMessage (account, name) {
  this.scope = 'stream:/' + account + '/' + name
  this.notifications = []

  const self = this
  this.notify = function (message) {
    self.notifications.push(message)
    self.emit(self.notifications.length)
  }
}
require('util').inherits(StreamMessage, EE)

StreamMessage.prototype.notifyFor = function (source) {
  const self = this
  return function (message) {
    message._source = source
    self.notifications.push(message)
    self.emit(self.notifications.length)
  }
}

StreamMessage.prototype.teardown = function () {
  this.notifications = []
  this.removeAllListeners()
}

StreamMessage.prototype.for_sender = PresenceMessage.prototype.for_client

StreamMessage.prototype.assert_ack_for = function (type, message, resource, action, value) {
  const expected = { to: this.scope }
  const ackNumber = message.ack
  delete message.ack

  switch (type) {
    case 'subscribe':
    case 'unsubscribe':
      expected.op = type
      break
    case 'push':
      expected.op = type
      expected.resource = resource
      expected.action = action
      expected.value = value
      break
    default:
      assert.ok(false)
  }
  expected.userData = this.client.userData

  assert.deepStrictEqual(expected, message)
  assert.ok(ackNumber > 0)

  // Restore
  message.ack = ackNumber
}

StreamMessage.prototype.assert_ack_for_subscribe = PresenceMessage.prototype.assert_ack_for_subscribe
StreamMessage.prototype.assert_ack_for_unsubscribe = PresenceMessage.prototype.assert_ack_for_unsubscribe
StreamMessage.prototype.assert_ack_for_push = function (message, resource, action, value) {
  this.assert_ack_for('push', message, resource, action, value)
}

StreamMessage.prototype.assert_push_notification = function (message, resource, action, value, sender) {
  sender = sender || this.client
  const id = message.id
  delete message.id
  const expected = {
    to: this.scope,
    op: 'push',
    resource: resource,
    action: action,
    value: value,
    userData: this.client.userData
  }
  assert.deepStrictEqual(expected, message)
  message.id = id
  assert.ok(message.id)
}

StreamMessage.prototype.assert_message_sequence = function (list, from) {
  let i
  const messages = this.notifications.slice(from)
  assert.strictEqual(list.length, messages.length, 'mismatch in number of messages')
  for (i = 0; i < messages.length; i++) {
    const listEntry = list[i]
    var resource, action, value, sender
    assert.ok(listEntry.length >= 3)
    assert.ok(listEntry.length <= 4)
    resource = listEntry[0]
    action = listEntry[1]
    value = listEntry[2]
    sender = listEntry[3]
    this.assert_push_notification(messages[i], resource, action, value, sender)
  }
}

StreamMessage.prototype.assert_get_response = function (response, list, idstart) {
  idstart = idstart || 1
  const values = []
  const scope = this.scope
  for (let i = 0; i < list.length; i++) {
    const listEntry = list[i]
    assert.strictEqual(listEntry.length, 4)
    values.push({
      to: scope,
      op: 'push',
      resource: listEntry[0],
      action: listEntry[1],
      value: listEntry[2],
      userData: listEntry[3].configuration('userData'),
      id: idstart + i
    })
  }

  assert.deepStrictEqual({
    op: 'get',
    to: this.scope,
    value: values
  }, response)
}

StreamMessage.prototype.assert_sync_error_notification = function (notification, state) {
  const error = { type: 'sync-error', from: state.from, size: state.size }
  if (state.start >= 0) {
    error.start = state.start
  }
  if (state.end >= 0) {
    error.end = state.end
  }

  assert.deepStrictEqual({
    op: 'push',
    to: this.scope,
    error: error
  }, notification)
}

StreamMessage.prototype.assert_sync_error_get_response = function (response, state) {
  const error = { type: 'sync-error', from: state.from, size: state.size }
  if (state.start >= 0) {
    error.start = state.start
  }
  if (state.end >= 0) {
    error.end = state.end
  }

  assert.deepStrictEqual({
    op: 'get',
    to: this.scope,
    value: [],
    error: error
  }, response)
}
// Sync is implemented as subscribe + get, hence the return op is "get"
StreamMessage.prototype.assert_sync_response = StreamMessage.prototype.assert_get_response
StreamMessage.prototype.fail_on_more_than = PresenceMessage.prototype.fail_on_more_than

module.exports = {
  PresenceMessage: PresenceMessage,
  StreamMessage: StreamMessage,
  newTestSentry: newTestSentry,
  presenceManagerForSentry: presenceManagerForSentry,
  SentryDefaults: SentryDefaults
}
