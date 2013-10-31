var http = require('http'),
    assert = require('assert'),
    Api = require('../api/api.js'),
    ClientScope = require('../api/lib/client'),
    Persistence = require('../core').Persistence,
    RemoteManager = require('../core').RemoteManager,
    Type = require('../core').Type,
    Status = require('../core').Status,
    MessageList = require('../core').MessageList,
    frontend;

var Client = new ClientScope({
  secure: false,
  host: 'localhost',
  port: 8123
});

exports['Radar api tests'] = {
  before: function(done) {
    Persistence.setConfig({redis_port:27000, redis_host:'localhost'});
    // create frontend server
    frontend = http.createServer(function(req, res){ res.end('404 error');});
    Api.attach(frontend);

    frontend.listen(8123, function() {
      done();
    });
  },

  after: function(done) {
    frontend.close();
    Persistence.disconnect();
    done();
  },

  // GET /radar/status?accountName=test&scope=ticket/1
  'can get a status scope': function(done) {
    var name = 'status:/test/ticket/1',
        opts = Type.getByExpression(name),
        status = new Status(name, {}, opts);

    status.setStatus({
      key: 'foo',
      value: 'bar'
    });

    Client.get('/node/radar/status')
      .data({ accountName: 'test', scope: 'ticket/1' })
      .end(function(error, response) {
        assert.deepEqual({foo:'bar'}, response);
        Persistence.ttl('status:/test/ticket/1', function(err, reply) {
          assert.ok((parseInt(reply, 10) > 0));
          done();
        });
      });
  },

  // POST /radar/status { accountName: 'test', scope: 'ticket/1' }
  'can set a status scope': function(done) {
    Client.post('/node/radar/status')
      .data({ accountName: 'test', scope: 'ticket/2', key: 'foo', value: 'bar' })
      .end(function(error, response) {
        assert.deepEqual({}, response);

        Client.get('/node/radar/status')
        .data({ accountName: 'test', scope: 'ticket/2' })
        .end(function(error, response) {
          assert.deepEqual({foo:'bar'}, response);
          Persistence.ttl('status:/test/ticket/2', function(err, reply) {
            assert.ok((parseInt(reply, 10) > 0));
            done();
          });
        });
      });

  },

  // GET /radar/message?accountName=test&scope=chat/1
  'can get a message scope': function(done) {

    var message_type = {
      expr: new RegExp('^message:/setStatus/(.+)$'),
      type: 'message',
      auth: false,
      policy: { cache: true, maxAgeSeconds: 30 }
    };

    Type.register('message', message_type);

    var name = 'message:/setStatus/chat/1',
        opts = Type.getByExpression(name),
        msgList = new MessageList(name, {}, opts);

    msgList.publish({},{
      key: 'foo',
      value: 'bar'
    });

    Client.get('/node/radar/message')
      .data({ accountName: 'setStatus', scope: 'chat/1' })
      .end(function(error, response) {
        assert.deepEqual({key:'foo', value: 'bar'}, JSON.parse(response[0]));
        done();
      });
  },

  // POST /radar/message { accountName:'test', scope:'ticket/1' }
  'can set a message scope': function(done) {

    var message_type = {
      expr: new RegExp('^message:/setStatus/(.+)$'),
      type: 'message',
      auth: false,
      policy: { cache: true, maxAgeSeconds: 30 }
    };

    Type.register('message', message_type);

    Client.post('/node/radar/message')
      .data({ accountName: 'setStatus', scope: 'chat/2', value: 'hello' })
      .end(function(error, response) {
        assert.deepEqual({}, response);

        Client.get('/node/radar/message')
        .data({ accountName: 'setStatus', scope: 'chat/2' })
        .end(function(error, response) {
          assert.deepEqual('hello', JSON.parse(response[0]).value);
          Persistence.ttl('message:/setStatus/chat/2', function(err, reply) {
            assert.ok((parseInt(reply, 10) > 0));
            done();
          });
        });
      });

  },

  'given a fake PresenceMonitor': {

    before: function(done) {
      function FakePersistence() {}

      var messages = {
        'presence:/test/ticket/1': {
          '1.1000': {
            userId: 1, userType: 0,
            clientId: 1000, online: true, at: new Date().getTime()
          }
        },
        'presence:/test/ticket/2': {
          '2.1001': {
            userId: 2, userType: 4,
            clientId: 1001, online: true, at: new Date().getTime()
          }
        }
      };

      FakePersistence.readHashAll = function(scope, callback) {
        callback(messages[scope]);
      };
      RemoteManager.setBackend(FakePersistence);
      done();
    },

    after: function(done) {
      RemoteManager.setBackend(Persistence);
      done();
    },

    // GET /radar/presence?accountName=support&scope=ticket/1
    'can get a presence scope using api v1': function(done) {
      Client.get('/node/radar/presence')
        .data({ accountName: 'test', scope: 'ticket/1' })
        .end(function(error, response) {
          assert.deepEqual({'1': 0 }, response);
          done();
        });
    },

    'can get multiple presence scopes using api v1': function(done) {
      Client.get('/node/radar/presence')
        .data({ accountName: 'test', scopes: 'ticket/1,ticket/2' })
        .end(function(error, response) {
          assert.deepEqual({ 'ticket/1': {'1': 0 }, 'ticket/2':{'2': 4}}, response);
          done();
        });
    },

    'can get a presence scope with client ids using api v2': function(done) {
      Client.get('/node/radar/presence')
        .data({ accountName: 'test', scope: 'ticket/1', version: 2 })
        .end(function(error, response) {
          assert.deepEqual( {'1':{'clients':{'1000':{}},'userType':0}}, response);
          done();
        });
    },

    'can get multiple presence scopes using api v2': function(done) {
      Client.get('/node/radar/presence')
        .data({ accountName: 'test', scopes: 'ticket/1,ticket/2', version: 2 })
        .end(function(error, response) {
          assert.deepEqual({ 'ticket/1': {'1':{'clients':{'1000':{}},'userType':0}}, 'ticket/2':{'2':{'clients':{'1001':{}},'userType':4}}}, response);
          done();
        });
    },
  }
};

// if this module is the script being run, then run the tests:
if (module == require.main) {
  var mocha = require('child_process').spawn('mocha', [ '--bail', '--colors', '--ui', 'exports', '--reporter', 'spec', __filename ]);
  mocha.stdout.pipe(process.stdout);
  mocha.stderr.pipe(process.stderr);
}
