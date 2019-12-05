// unique string ids are used in many places in radar
// this module should be used to generating them, to
// ensure consistency

var defaultGenerator = require('uuid/v4')
var generator = defaultGenerator

// () => String
function generateUniqueId () {
  return generator()
}

function setGenerator (fn) {
  generator = fn
}

module.exports = generateUniqueId
module.exports.setGenerator = setGenerator
Object.defineProperty(module.exports, 'defaultGenerator', {
  get: function () {
    return defaultGenerator
  }
})
