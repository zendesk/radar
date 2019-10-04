var StateMachine = require('javascript-state-machine')

module.exports.create = function createClientSessionStateMachine (clientSession) {
  return new StateMachine({
    init: 'initializing',
    transitions: [
      { name: 'initialize', from: 'initializing', to: 'ready' },
      { name: 'leave', from: 'ready', to: 'not ready' },
      { name: 'comeback', from: 'not ready', to: 'ready' },
      { name: 'end', from: ['initializing', 'ready', 'not ready'], to: 'ended' }
    ],
    methods: {
      onInitialize: function () {
        clientSession.emit('initialize')
      },
      onEnd: function () {
        clientSession._cleanup()
        clientSession.emit('end')
      }
    }
  })
}
