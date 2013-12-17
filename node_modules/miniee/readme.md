# MiniEE

MiniEE is a client and server side library for routing events.

The main difference from EventEmitter is that callbacks can be specified using RegExps.

Works on the client and the server.

# Installing:

    npm install miniee

# Using:

    var MiniEE = require('miniee');
    var MyClass = function() {};
    MiniEE.mixin(MyClass);

    var obj = new MyClass();    
    // set string callback
    obj.on('event', function(arg1, arg2) { console.log(arg1, arg2); });
    obj.emit('event', 'aaa', 'bbb'); // trigger callback

    // set regexp callback
    obj.on(/event.*/, function(arg) { console.log(arg); });
    // trigger regexp callback
    obj.emit('event-123', 'aaa', 'bbb');

# See also:

    http://nodejs.org/api/events.html

