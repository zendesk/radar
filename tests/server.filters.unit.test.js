var common = require('./common.js'),
    assert = require('assert'),
    RadarTypes = require('../core/lib/type.js'),
    controlMessage = { 
      to: 'control:/dev/test',
      op: 'nameSync',
      options: {
        association: {
          id: 1,
          name: 1
        }
      }
    },
    radarServer,
    socket;

describe('given a server with filters', function() {
  beforeEach(function(done) {
    radarServer = common.createRadarServer(done);
    socket = { id: 1 };
  });

  afterEach(function(done) {
    radarServer.terminate(done);
  });

  describe('with no filters', function() {
    it('should not halt execution', function(done) {
      socket.send = function(message) {
        assert.equal('ack', message.op);
        done();
      };

      radarServer._processMessage(socket, controlMessage);
    });
  });

  describe('with 1 filter', function() {
    it('if OK, it should run it and continue', function(done) {
      var called = false;

      // Will be called
      socket.send = function(message) {
        assert.equal('ack', message.op);
        assert.ok(called);
        done();
      };

      radarServer.use({
        pre: function(client, message, options, next) {
          called = true;
          assert.equal(client.id, socket.id);
          assert.equal(options.type, 'Control');
          assert.deepEqual(message, controlMessage);
          next();
        }
      });
      
      radarServer._processMessage(socket, controlMessage);  
    });

    it('if NOT OK, it should run it and halt', function(done) {
      var called = false;

      socket.send = function(message) {
        assert.equal('err', message.op);
        assert(called);
        done();
      };

      radarServer.use({
        pre: function(client, message, options, next) {
          called = true;
          assert.equal(options.type, 'Control');
          socket.send({ op: 'err' });
          next('err');
        }
      });
      
      radarServer._processMessage(socket, controlMessage);  
    });
  });

  describe('with multiple filters', function() {
    it('should respect order', function(done) {
      var previous;

      socket.send = function(value) {
        if (value === 1) {
          previous = value;
        } else if (value === 2) {
          assert.equal(previous, 1);
          done();
        }
      };

      var firstFilter = {
        pre: function(client, message, options, next) {
          client.send(1);
          next();
        }
      };

      var secondFilter = {
        pre: function(client, message, options, next) {
          client.send(2);
          next();
        }
      };
      
      radarServer.use(firstFilter);
      radarServer.use(secondFilter);

      radarServer._processMessage(socket, controlMessage);  
    });
  });
});  
