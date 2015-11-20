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
    authProvider = {
      authorize: function(channel, message, client) {
        return false;
      }
    },
    authorizedType = {
      name: 'general control',
      type: 'Control',
      authProvider: authProvider,
      expression: /^control:/
    },
    LegacyAuthManager = require('../server/middleware/legacy_auth_manager.js'),
    radarServer,
    socket;

describe('given a server', function() {
  describe('without authentication', function() {
    beforeEach(function(done) {
      radarServer = common.createRadarServer(done);
      radarServer.use(new LegacyAuthManager());
      socket = { id: 1 };
    });

    it('it should allow access', function(done) {
      socket.send = function(message) {
        assert.equal('ack', message.op);
        done();
      };

      radarServer._processMessage(socket, controlMessage);  
    });
  });

  describe('with authentication', function() {
    beforeEach(function(done) {
      RadarTypes.replace([authorizedType]);
      radarServer = common.createRadarServer(done);
      radarServer.use(new LegacyAuthManager());
      socket = { id: 1 };
    });

    it('it should prevent unauthorized access', function(done) {
      socket.send = function(message) {
        assert.equal('err', message.op);
        assert.equal('auth', message.value);
        done();
      };

      radarServer._processMessage(socket, controlMessage);  
    });
  });
  
});
