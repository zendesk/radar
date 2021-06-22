const logger = require('minilog')('radar:types')

let Types = [
  {
    name: 'general message',
    type: 'MessageList',
    expression: /^message:/
  },
  {
    name: 'general status',
    type: 'Status',
    expression: /^status:/
  },
  {
    name: 'general presence',
    type: 'Presence',
    expression: /^presence:/,
    policy: { cache: true, maxAgeSeconds: 15 }
  },
  {
    name: 'general stream',
    type: 'Stream',
    expression: /^stream:/
  },
  {
    name: 'general control',
    type: 'Control',
    expression: /^control:/
  }
]

// Get the type by resource "to" (aka, full scope)
function getByExpression (to) {
  if (to) {
    const l = Types.length
    let definition
    let expression
    for (let i = 0; i < l; ++i) {
      definition = Types[i]
      expression = definition.expression || definition.expr
      if (!expression) {
        logger.error('#type - there is a type definition without an expression.',
          i, definition.name)
        continue
      }

      if ((expression.test && expression.test(to)) || expression === to) {
        logger.debug('#type - found', to)
        return definition
      }
    }
  }
  logger.warn('#type - Unable to find a valid type definition for:' + to)
}

module.exports = {
  getByExpression: getByExpression,
  // Deprecated
  register: function (name, type) {
    logger.debug('#type - register', type)
    Types.unshift(type)
  },
  add: function (types) {
    Types = types.concat(Types)
  },
  replace: function (types) {
    Types = types
  }
}
