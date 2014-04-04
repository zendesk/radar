var ConnectionHelper = require('../core/lib/connection_helper.js'),
    assert = require('assert'),
    configuration = require('../configuration.js');

exports['Given a configuration to Connection Helper'] = {
  beforeEach: function() {
    this.configuration = JSON.parse(JSON.stringify(configuration));
  },
  'should fallback to legacy style if no use_connection': function(){
    delete this.configuration.use_connection;
    var parsed = ConnectionHelper.parse(this.configuration);
    assert.equal(parsed.name, 'default');
    assert.deepEqual(parsed.config, {
      host: 'localhost',
      port: 6379
    });
  },
  'should use use_connection if present (redis)': function() {
    this.configuration.use_connection = 'legacy';
    this.configuration.connection_settings.legacy.port = 6380;
    var parsed = ConnectionHelper.parse(this.configuration);
    assert.equal(parsed.name, 'legacy');
    assert.deepEqual(parsed.config, {
      host: 'localhost',
      port: 6380
    });
  },
  'should use use_connection if present (sentinel)': function() {
    this.configuration.use_connection = 'cluster1';
    var parsed = ConnectionHelper.parse(this.configuration);
    assert.equal(parsed.name, 'cluster1');
    assert.deepEqual(parsed.config, {
      id: 'mymaster',

      sentinels: [
      {
        host: 'localhost',
        port: 26379
      }]
    });
  },
  'should throw error if use_connection defined but not present': function() {
    var self = this;
    this.configuration.use_connection = 'undeclared';
    assert.throws(function() {
      ConnectionHelper.parse(self.configuration);
    },
    /No connection_settings provided/);
  }
};
