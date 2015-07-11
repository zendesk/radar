var common = require('./common.js'),
    assert = require('assert'),
    subscribeMessage = {
      op: 'subscribe',
      to: 'presence:/z1/test/ticket/1'
    },
    radarServer, socket;

describe('given a server',function() {

  beforeEach(function() {
    radarServer = common.createRadarServer();
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

  it('should return an error when an invalid message type is sent', function(done) {
    var invalidMessage = { to: 'invalid:/thing' };

    socket.send = function(message) {
      assert.equal(message.value, 'unknown_type');
      done();
    };

    radarServer._processMessage(socket, invalidMessage);
  });
});
