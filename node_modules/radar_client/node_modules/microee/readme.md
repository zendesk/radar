# MicroEE

A client and server side library for routing events.

I was disgusted by the size of [MiniEE](https://github.com/mixu/miniee) (122 sloc, 4.4kb), so I decided a rewrite was in order.

This time, without the support for regular expressions - but still with the support for "when", which is my favorite addition to EventEmitters.

MicroEE is a more satisfying (42 sloc, ~1100 characters), and passes the same tests as MiniEE (excluding the RegExp support, but including slightly tricky ones like removing callbacks set via once() using removeListener where function equality checks are a bit tricky).

# Installing:

    npm install microee

# In-browser version

Use the version in `./dist/`. It exports a single global, `microee`.

To run the in-browser tests, open `./test/index.html` in the browser after cloning this repo and doing npm install (to get Mocha).

# Using:

    var MicroEE = require('microee');
    var MyClass = function() {};
    MicroEE.mixin(MyClass);

    var obj = new MyClass();
    // set string callback
    obj.on('event', function(arg1, arg2) { console.log(arg1, arg2); });
    obj.emit('event', 'aaa', 'bbb'); // trigger callback

# Supported methods

- on(event, listener)
- once(event, listener)
- emit(event, [arg1], [arg2], [...])
- removeListener(event, listener)
- removeAllListeners([event])
- when (not part of events.EventEmitter)
- mixin (not part of events.EventEmitter)

# Niceties

- when(event, callback): like once(event, callback), but only removed if the callback returns true.
- mixin(obj): adds the MicroEE functions onto the prototype of obj.
- The following functions return `this`: on(), emit(), once(), when()

# See also:

    http://nodejs.org/api/events.html
