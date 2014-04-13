var ConnectionHelper = require('../core/lib/connection_helper.js'),
    assert = require('assert'),
    configuration = require('../configuration.js');

describe('Given a configuration to Connection Helper', function() {
  beforeEach(function() {
    this.configuration = JSON.parse(JSON.stringify(configuration));
  });
  describe('if use_connection is present', function() {
    it('should parse redis config correctly', function() {
      this.configuration.use_connection = 'legacy';
      this.configuration.connection_settings.legacy.port = 6380;
      var parsed = ConnectionHelper.parse(this.configuration);
      assert.equal(parsed.name, 'legacy');
      assert.deepEqual(parsed.config, {
        host: 'localhost',
        port: 6380
      });
    });
    it('should parse sentinel config correctly', function() {
      this.configuration.use_connection = 'cluster1';
      var parsed = ConnectionHelper.parse(this.configuration);
      assert.equal(parsed.name, 'cluster1');
      assert.deepEqual(parsed.config, {
        id: 'mymaster',
        sentinels: [{ host: 'localhost', port: 26379 }]
      });
    });
    it('should throw error if missing from connection_settings', function() {
      var self = this;
      this.configuration.use_connection = 'non-existing';
      assert.throws(function() {
        ConnectionHelper.parse(self.configuration);
      }, /No connection_settings provided/);
    });
  });

  describe('if use_connection is not present', function() {
    it('should fallback to legacy style', function(){
      delete this.configuration.use_connection;
      var parsed = ConnectionHelper.parse(this.configuration);
      assert.equal(parsed.name, 'default');
      assert.deepEqual(parsed.config, {
        host: 'localhost',
        port: 6379
      });
    });
  });
});
