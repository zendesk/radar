var log = require('minilog')('radar_state'),
    MicroEE = require('microee'),
    Backoff = require('./backoff'),
    Machine = require('sfsm');

function create() {
  var backoff = new Backoff(),
      machine = Machine.create({

    error: function(name, from ,to, args, type, message, err) {
      log.warn('state-machine-error', arguments);

      if (err) {
        throw err;
      }
    },

    events: [
      { name: 'connect',       from: [ 'opened', 'disconnected' ], to: 'connecting' },
      { name: 'established',   from: 'connecting', to: 'connected' },
      { name: 'authenticate',  from: 'connected', to: 'authenticating' },
      { name: 'activate',      from: [ 'authenticating', 'activated' ], to: 'activated' },
      { name: 'disconnect',    from: Machine.WILDCARD, to: 'disconnected' },
      { name: 'close',         from: Machine.WILDCARD, to: 'closed' },
      { name: 'open',          from: [ 'none', 'closed' ], to: 'opened' }
    ],

    callbacks: {
      onevent: function(event, from, to) {
        log.debug('before-' + event + ', from: ' + from + ', to: ' + to, Array.prototype.slice.call(arguments));

        this.emit('event', event);
        this.emit(event, arguments);
      },

      onstate: function(event, from, to) {
        log.debug('event-state-' + event + ', from: ' + from + ', to: ' + to, Array.prototype.slice.call(arguments));

        this.emit('enterState', to);
        this.emit(to, arguments);
      },

      onconnecting: function() {
        this.startGuard();
      },

      onestablished: function() {
        this.cancelGuard();
        backoff.success();
        this.authenticate();
      },

      onclose: function() {
        this.cancelGuard();
      },

      ondisconnected: function(event, from, to) {
        backoff.increment();

        if (this._timer) {
          clearTimeout(this._timer);
          delete this._timer;
        }

        this._timer = setTimeout(function() {
          delete machine._timer;
          if (machine.is('disconnected')) {
            machine.connect();
          }
        }, backoff.get());

        if (backoff.isUnavailable()) {
          this.emit('unavailable');
        }
      }
    }
  });

  machine._backoff = backoff; // for testing
  machine._connectTimeout = 10000;

  for (var property in MicroEE.prototype) {
    if (MicroEE.prototype.hasOwnProperty(property)) {
      machine[property] = MicroEE.prototype[property];
    }
  }

  machine.open();

  machine.start = function() {
    if (this.is('closed')) {
      this.open();
    }

    if (this.is('activated')) {
      this.activate();
    } else {
      this.connectWhenAble();
    }
  };

  machine.startGuard = function() {
    machine.cancelGuard();
    machine._guard = setTimeout(function() {
      log.info("startGuard: disconnect from timeout");
      machine.disconnect();
    }, machine._connectTimeout);
  };

  machine.cancelGuard = function() {
    if (machine._guard) {
      clearTimeout(machine._guard);
      delete machine._guard;
    }
  };

  machine.connectWhenAble = function() {
    if (!(this.is('connected') || this.is('activated'))) {
      if (this.can('connect')) {
        this.connect();
      } else {
        this.once('enterState', function() {
          machine.connectWhenAble();
        });
      }
    }
  };

  return machine;
}

module.exports = { create: create };

