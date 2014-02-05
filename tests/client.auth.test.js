var http = require('http'),
  assert = require('assert'),
  Radar = require('../server/server.js'),
  Client = require('radar_client').constructor,
  Type = require('../core').Type;

var configuration = require('./common.js').configuration;

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
    this.radar.terminate();
    this.server.close(done);
  },

  beforeEach: function(done) {
    this.client = new Client().configure({
      userId: 111,
      userType: 0,
      accountName: 'client_auth',
      port: configuration.port,
      upgrade: false,
      userData: { name: 'tester0' }
    }).on('ready', done).alloc('test');
  },

  afterEach: function() {
    this.client.dealloc('test');
    this.client.manager.close();
  },

  // GET /radar/message?accountName=test&scope=chat/1
  'failed authentication should return the original message': function(done) {

    Type.add([{
      name: 'client_auth',
      expression: /^message:\/client_auth\/test$/,
      type: 'MessageList',
      authorize: function() { return false; }
    }]);

    var originalMessage = { hello: 'world', timestamp: Date.now()};

    this.client.message('test').publish(originalMessage);

    this.client.on('err', function(message) {
      assert.ok(message.origin);
      assert.equal(message.origin.op, 'publish');
      assert.equal(message.origin.to, 'message:/client_auth/test');
      assert.deepEqual(message.origin.value, originalMessage);
      done();
    });

  }
};
