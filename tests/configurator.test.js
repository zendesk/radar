/* global describe, it */

var assert = require('assert'),
    noArgs = ['', ''], 
    noEnv = {}, 
    Configurator = require('../configurator.js');

describe('the Configurator', function() {

  it('has a default configuration', function() {
    var config = Configurator.load();
    assert.equal(8000, config.port);
  });

  describe('while dealing with env vars', function() {
    it('env vars should win over default configuration', function() {
      var config = Configurator.load({
            config: { port: 8000 },
            argv: noArgs,
            env: { 'RADAR_PORT': 8001 }
          });

      assert.equal(8001, config.port);
    });

    it('should only overwrite the right keys', function() {
      var config = Configurator.load({
        config: {port: 8004},
        env: { 
          'RADAR_SENTINEL_MASTER_NAME': 'mymaster',
          'RADAR_SENTINEL_URLS': 'sentinel://localhost:7777'
        }
      });
      assert.equal(8004, config.port);
      assert.equal('mymaster', config.sentinelMasterName);
    });

  });

  function describeOptionTest(name, options){
    describe('option: ' + name, function() {
      if (options.default) {
        it ('default must be ' + options.expected, function() {
          var config = Configurator.load({});
          assert.equal(config[name], options.default);
        });
      };

      it('config: ' + name, function() {
        var configOptions = {}
        configOptions[name] = options.expected;
        var config = Configurator.load({ config: configOptions, argv: noArgs, env: noEnv });
        assert.equal(config[name], options.expected);
      });

      it('env: ' + options.env, function() {
        var envOptions = {}
        envOptions[options.env] = options.expected;
        var config = Configurator.load({ env: envOptions });
        assert.equal(config[name], options.expected);
      });
  
      if (options.short) {
        it('short arg: ' + options.short, function() {
          var config = Configurator.load({ argv: ['', '', options.short, options.expected ] });
          assert.equal(config[name], options.expected);
        });
      }

      if (options.long) {
        it('long arg: ' + options.long, function() {
          var config = Configurator.load({ argv: ['', '', options.long, options.expected ] });
          assert.equal(config[name], options.expected);
        });
      }
    });
  }
  describe('supported options', function() {
    describeOptionTest('port', {
      default:  8000, 
      expected: 8004, 
      short:    '-p',
      long:     '--port', 
      env:      'RADAR_PORT'
    });

    describeOptionTest('redisUrl', {
      default:    'redis://localhost:6379', 
      expected:   'redis://localhost:9000', 
      short:      '-r', 
      long:       '--redis_url', 
      env:        'RADAR_REDIS_URL'
    });

    describeOptionTest('healthReportInterval', {
      default:    '10000', 
      expected:   '10001', 
      long:       '--interval', 
      short:      '-i', 
      env:        'RADAR_HEALTH_REPORT_INTERVAL'
    });

    describeOptionTest('sentinelMasterName', {
      expected:   'mymaster', 
      long:       '--sentinel_master_name', 
      env:        'RADAR_SENTINEL_MASTER_NAME'
    });

    describeOptionTest('sentinelUrls', {
      expected:   'sentinel://localhost:1000', 
      long:       '--sentinel_urls', 
      env:        'RADAR_SENTINEL_URLS'
    });
  });
});

