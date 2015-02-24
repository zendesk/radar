var Minilog = require('minilog');

var formatter = new Minilog.Transform();
formatter.nameLength = 22;
formatter.write = function(name, level, args) {
  var i;
  if (this.nameLength < name.length) {
    this.nameLength = name.length;
  }
  for(i = name.length; i < this.nameLength; i++) {
    name = name.concat(' ');
  }
  var result = [].concat(args);
  for(i = 0; i < result.length; i++) {
    if (result[i] && typeof result[i] == 'object') {
      // Buffers in Node.js look bad when stringified
      if (result[i].constructor && result[i].constructor.isBuffer) {
        result[i] = result[i].toString();
      } else {
        try {
          result[i] = JSON.stringify(result[i]);
        } catch(stringifyError) {
          // Happens when an object has a circular structure
          // Do not throw an error, when printing, the toString() method of the object will be used
        }
      }
    } else {
      result[i] = result[i];
    }
  }

  this.emit('item', name, level, [result.join(' ')+'\n']);
};

module.exports = formatter;
