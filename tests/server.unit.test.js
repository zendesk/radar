var common = require('./common.js'),
    assert = require('assert'),
    Request = require('radar_message').Request,
    subscribeMessage = {
      op: 'subscribe',
      to: 'presence:/z1/test/ticket/1'
    },
    subscribeRequest = new Request(subscribeMessage),
    radarServer,
    socket;

describe('given a server',function() {

  beforeEach(function(done) {
    radarServer = common.createRadarServer(done);
    socket = {
      id: 1
    };
  });

  it('should emit resource:new when allocating a new resource', function(done) {
    radarServer.on('resource:new', function(resource) {
      assert.equal(resource.to, subscribeRequest.getAttr('to'));
      //assert.equal(resource.to, subscribeMessage.to);
      done();
    });

    setTimeout(function() {
      radarServer._processRequest(socket, subscribeRequest);
    }, 100);
  });

  it('should emit resource:new when allocating a new resource, but not on subsequent calls', function(done) {
    var called = false;

    radarServer.on('resource:new', function(resource) {
      assert(!called);
      called = true;

      setImmediate(function() {
        radarServer._processRequest(socket, subscribeRequest);
      });
    });

    setTimeout(function() {
      radarServer._processRequest(socket, subscribeRequest);
      setTimeout(done, 1800);
    }, 100);
  });

  it('should return an error when an invalid message type is sent', function(done) {
    var invalidMessage = { to: 'invalid:/thing' },
        invalidRequest = new Request(invalidMessage);

    socket.send = function(message) {
      assert.equal(message.value, 'unknown_type');
      done();
    };

    radarServer._processRequest(socket, invalidRequest);
  });

  it('should stamp incoming messages', function(done) {
    var called = false, 
        message = { 
          to: 'presence:/dev/test/ticket/1',
          op: 'subscribe'
        },
        request = new Request(message);

    radarServer.on('resource:new', function(resource) {
      
      resource.subscribe(socket.id, { ack: 1 });

      resource.on('message:incoming', function(incomingMessage) {
        assert(incomingMessage.stamp.id !== undefined);
        assert.equal(incomingMessage.stamp.clientId, socket.id);
        assert.equal(incomingMessage.stamp.sentryId, radarServer.sentry.name);
        done();
      });
    });

    setTimeout(function() {
      radarServer._processRequest(socket, request);
    }, 100);
  });
});
