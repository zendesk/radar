var StateMachine = require('javascript-state-machine')

var bind = function (fn, context) {
  return function () {
    // parameters: event, from, to, ...args
    var args = Array.prototype.slice.call(arguments, 3)
    return fn.apply(context, args)
  }
}

module.exports.create = function createClientSessionStateMachine (clientSession) {
  return StateMachine.create({
    initial: 'initializing',
    events: [
      { name: 'initialize', from: 'initializing', to: 'ready' },
      { name: 'leave', from: 'ready', to: 'not ready' },
      { name: 'comeback', from: 'not ready', to: 'ready' },
      { name: 'end', from: ['initializing', 'ready', 'not ready'], to: 'ended' }
    ],
    callbacks: {
      oninitialize: bind(oninitialize, clientSession),
      onend: bind(onend, clientSession)
    }
  })
}

function oninitialize () {
  this.emit('initialize')
}

function onend () {
  this._cleanup()
  this.emit('end')
}
