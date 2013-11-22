var http = require('http'),
  assert = require('assert'),
  Radar = require('../server/server.js'),
  Persistence = require('../core').Persistence,
  verbose = false,
  Client = require('radar_client').constructor,
  Type = require('../core').Type,
  Status = require('../core').Status;

if (verbose) {
  var Minilog = require('minilog');
  Minilog.pipe(Minilog.backends.nodeConsole)
    .format(Minilog.backends.nodeConsole.formatWithStack);
}

var configuration = {
  redis_host: 'localhost',
  redis_port: 6379,
  port: 8000
}

exports['auth: given a server and a client'] = {
  before: function(done) {

    // create frontend server
    this.server = http.createServer(function(req, res) {
      res.end('404 error');
    });
    this.radar = new Radar();
    this.radar.attach(this.server, configuration);

    this.server.listen(configuration.port, function() {
      done();
    });
  },

  after: function(done) {
    this.server.close();
    this.radar.terminate();
    Persistence.disconnect();
    done();
  },

  beforeEach: function(done) {
    this.client = new Client().configure({
      userId: 123,
      userType: 0,
      accountName: 'test',
      port: configuration.port,
      upgrade: false,
      userData: { name: 'tester' }
    }).on('ready', done).alloc('test');
  },

  afterEach: function() {
    this.client.dealloc('test');
  },

  // GET /radar/message?accountName=test&scope=chat/1
  'failed authentication should return the original message': function(done) {

    Type.register('message', {
      expr: new RegExp('.*'),
      type: 'message',
      auth: function(message, client) {
        return false;
      }
    });

    var originalMessage = { hello: "world", timestamp: Date.now()};

    this.client.message('test').publish(originalMessage);

    this.client.on('err', function(message) {
      assert.ok(message.origin);
      assert.equal(message.origin.op, 'publish');
      assert.equal(message.origin.to, 'message:/test/test');
      assert.deepEqual(message.origin.value, originalMessage);
      done();
    });

  }
};

// if this module is the script being run, then run the tests:
if (module == require.main) {
  var mocha = require('child_process').spawn('mocha', [ '--bail', '--colors', '--ui', 'exports', '--reporter', 'spec', __filename ]);
  mocha.stdout.pipe(process.stdout);
  mocha.stderr.pipe(process.stderr);
}
