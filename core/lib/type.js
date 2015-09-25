var logger = require('minilog')('radar:types');

var Types = [
  {
    name: 'general message',
    type: 'MessageList',
    expression: /^message:/,
  },
  {
    name: 'general status',
    type: 'Status',
    expression: /^status:/,
  },
  {
    name: 'general presence',
    type: 'Presence',
    expression: /^presence:/,
    policy: { cache: true, maxAgeSeconds: 15 },
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
];

// Get the type by resource "to" (aka, full scope)
function getByExpression(to) {
  if (to) {
    for (var i = 0, l = Types.length, definition, expression; i < l; ++i) {
      definition = Types[i];
      expression = definition.expression || definition.expr;
      if (!expression) {
        logger.error('#type - there is a type definition without an expression.',
                                                              i, definition.name);
        continue;
      }

      if (expression.test && expression.test(to) || expression === to) {
        logger.debug('#type - found', to);
        return definition;
      }
    }
  }
  logger.error('#type - Unable to find a valid type definition for:', to);
}

module.exports = {
  getByExpression: getByExpression,
  // Deprecated
  register: function(name, type) {
    logger.debug('#type - register', type);
    Types.unshift(type);
  },
  add: function(types) {
    Types = types.concat(Types);
  },
  replace: function(types) {
    Types = types;
  }
};

