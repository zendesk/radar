var http = require('http'),
    assert = require('assert'),
    Persistence = require('persistence'),
    RadarServer = new require('../index.js').server,
    configuration = require('../configurator.js').load({persistence: true}),
    subscribeMessage = {
      op: 'subscribe',
      to: 'presence:/z1/test/ticket/1'
    },
    notFound = function p404(req, res){ },
    httpServer, radarServer, socket;

describe('given a server',function() {

  beforeEach(function() {
    httpServer = http.createServer(notFound);
    radarServer = new RadarServer();
    radarServer.attach(httpServer, configuration);
    socket = {};
  });

  it('should emit resource:new when allocating a new reosurce', function(done) {
    radarServer.on('resource:new', function(resource) {
      assert.equal(resource.name, subscribeMessage.to);
      done();
    });

    setTimeout(function() {
      radarServer._processMessage(socket, subscribeMessage);
    }, 100);

  });

  it('should emit resource:new when allocating a new resource, but not on subsequent calls', function(done) {
    var called = false;

    radarServer.on('resource:new', function(resource) {
      assert(!called);
      called = true;

      setImmediate(function() {
        radarServer._processMessage(socket, subscribeMessage);
      });
    });

    setTimeout(function() {
      radarServer._processMessage(socket, subscribeMessage);
      setTimeout(done, 1800);
    }, 100);

  });
});
