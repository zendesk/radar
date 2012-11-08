var fs = require('fs'),
    http = require('http'),
    https = require('https'),
    assert = require('assert'),

    Api = require('../api.js'),
    RadarApi = require('../apis/radar.js'),
    ClientScope = require('../lib/client'),
    Persistence = require('../../core').Persistence,

    RemoteManager = require('../../core').RemoteManager,

    Type = require('../../core').Type,
    Status = require('../../core').Status,

    logging = require('minilog')('test');

var subdomain = 'support',
    frontend,
    backend,
    routes;

var Client = new ClientScope({
  secure: false,
  host: 'localhost',
  port: 8123
});

exports['Radar api tests'] = {
  before: function(done) {
    // create frontend server
    frontend = http.createServer(function(req, res){ res.end('404 error');});
    Api.attach(frontend);

    frontend.listen(8123, function() {
      done();
    });
  },

  after: function(done) {
    frontend.close();
    Persistence.disconnect();
    done();
  },

  // GET /radar/status?accountName=test&scope=ticket/1
  'can get a status scope': function(done) {
    var name = 'status:/test/ticket/1',
        opts = Type.getByExpression(name),
        status = new Status(name, {}, opts);

    status.setStatus({
      key: 'foo',
      value: 'bar'
    });

    Client.get('/node/radar/status')
      .data({ accountName: 'test', scope: 'ticket/1' })
      .end(function(error, response) {
        assert.deepEqual({"foo":"bar"}, response);
        done();
      });
  },

  'given a fake PresenceMonitor': {

    before: function(done) {
      // swap backend with fake presence monitor
      function FakePresence(scope) {
        this.scope = scope;
      }
      FakePresence.prototype.fullRead = function(callback) {
        if(this.scope == 'presence:/test/ticket/1') {
          callback({ 1: 'online' });
        } else {
          callback({ 2: 'online' });
        }
      };
      RadarApi._setPresenceMonitor(FakePresence);
      done();
    },

    after: function(done) {
      RadarApi._setPresenceMonitor(RemoteManager);
      done();
    },

    // GET /radar/presence?accountName=support&scope=ticket/1
    'can get a presence scope': function(done) {
      Client.get('/node/radar/presence')
        .data({ accountName: 'test', scope: 'ticket/1' })
        .end(function(error, response) {
          assert.deepEqual({"1":"online"}, response);
          done();
        });
    },

    'can get multiple presence scopes': function(done) {
      Client.get('/node/radar/presence')
        .data({ accountName: 'test', scopes: 'ticket/1,ticket/2' })
        .end(function(error, response) {
          assert.deepEqual({ "ticket/1": {"1":"online"}, "ticket/2":{"2":"online"}}, response);
          done();
        });
    }
  }
};

// if this module is the script being run, then run the tests:
if (module == require.main) {
  var mocha = require('child_process').spawn('mocha', [ '--bail', '--colors', '--ui', 'exports', '--reporter', 'spec', __filename ]);
  mocha.stdout.pipe(process.stdout);
  mocha.stderr.pipe(process.stderr);
}
