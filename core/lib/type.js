var Types = {};

function get(type) {
  return Types[type];
}

// Get the type by resource name.
function getByExpression(name) {
  var def = {
    type: 'message',
    auth: false
  };
  if(!name) {
    return def;
  }
  var keys = Object.keys(Types);
  for(var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var type = Types[key];
    if(type.expr.constructor == String && type.expr == name) {
      return type;
    } else if(type.expr instanceof RegExp && type.expr.test(name)) {
      return type;
    }
  }
  // if the channel is not defined, the type should be detected from the name
  def.type = name.split(':', 2)[0];
  if(def.type != 'presence' && def.type != 'status' && def.type != 'message') {
    def.type = 'message';
  }
  if(def.type == 'presence') {
    def.policy = { cache: true, maxAgeSeconds: 15 };
  }
  return def;
};

module.exports = {
  get: get,
  getByExpression: getByExpression,
  register: function(name, type) {
    Types[name] = type;
  }
};

