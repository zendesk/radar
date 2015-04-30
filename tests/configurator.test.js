/* global describe, it */

var assert = require('assert'),
    noArgs = ['', ''], 
    noEnv = {}, 
    Configurator = require('../configurator.js');

// Helper function. It tests multiple features of a given configuration option. 
function describeOptionTest(configurator, name, options){
  describe('option: ' + name, function() {
    if (options.default) {
      it ('default must be ' + options.default, function() {
        var config = configurator.load({});
        assert.equal(config[name], options.default, "Expected " + config[name] + "to equal " + options.default);
      });
    };

    it('config: ' + name, function() {
      var configOptions = {}
      configOptions[name] = options.expected;
      var config = configurator.load({ config: configOptions, argv: noArgs, env: noEnv });
      assert.equal(config[name], options.expected, "Expected " + config[name] + " to equal " + options.expected);
    });

    it('env: ' + options.env, function() {
      var envOptions = {}
      envOptions[options.env] = options.expected;
      var config = configurator.load({ env: envOptions });
      assert.equal(config[name], options.expected);
    });

    if (options.short) {
      it('short arg: ' + options.short, function() {
        var config = configurator.load({ argv: ['', '', options.short, options.expected ] });
        assert.equal(config[name], options.expected);
      });
    }

    if (options.long) {
      it('long arg: ' + options.long, function() {
        var config = configurator.load({ argv: ['', '', options.long, options.expected ] });
        assert.equal(config[name], options.expected);
      });
    }
  });
}

describe('the Configurator', function() {

  it('has a default configuration', function() {
    var config = new Configurator().load();
    assert.equal(8000, config.port);
  });

  describe('while dealing with env vars', function() {
    it('env vars should win over default configuration', function() {
      var config = new Configurator().load({
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

  describe('default settings', function() {
    var configurator = new Configurator();

    describeOptionTest(configurator, 'port', {
      default:  8000, 
      expected: 8004, 
      short:    '-p',
      long:     '--port', 
      env:      'RADAR_PORT'
    });

    describeOptionTest(configurator, 'redisUrl', {
      default:    'redis://localhost:6379', 
      expected:   'redis://localhost:9000', 
      short:      '-r', 
      long:       '--redis_url', 
      env:        'RADAR_REDIS_URL'
    });

    describeOptionTest(configurator, 'healthReportInterval', {
      default:    '10000', 
      expected:   '10001', 
      long:       '--interval', 
      short:      '-i', 
      env:        'RADAR_HEALTH_REPORT_INTERVAL'
    });

    describeOptionTest(configurator, 'sentinelMasterName', {
      expected:   'mymaster', 
      long:       '--sentinel_master_name', 
      env:        'RADAR_SENTINEL_MASTER_NAME'
    });

    describeOptionTest(configurator, 'sentinelUrls', {
      expected:   'sentinel://localhost:1000', 
      long:       '--sentinel_urls', 
      env:        'RADAR_SENTINEL_URLS'
    });
  });

  describe('custom setting', function(){
    var newOption = {
          name:     'testOption', description: 'test option',
          env:      'RADAR_TEST', 
          abbr:     'e',
          full:     'exp',
          default:  'testDefault'
        },
        configurator = new Configurator([newOption]);
    
    describeOptionTest(configurator, 'testOption', {
      default:    'testDefault', 
      expected:   'expected', 
      long:       '--exp', 
      short:      '-e', 
      env:        'RADAR_TEST'
    })

  });
});

