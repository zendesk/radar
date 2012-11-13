var url = require('url'),
    Status = require('../../core').Status,
    MessageList = require('../../core').MessageList,
    RemoteManager = require('../../core').RemoteManager,
    Type = require('../../core').Type,
    hostname = require('os').hostname();
// Note that Firefox needs a application/json content type or it will show a warning

// curl -k -H "Content-Type: application/json" -X POST -d '{"accountName":"test","scope":"ticket/1","key":"greeting","value":"hello"}' https://localhost/radar/status
function setStatus(req, res, re, data) {
  var q = {};
  try {
    q = JSON.parse(data);
  } catch(e) {
    return res.end();
  }
  if(!q || !q.accountName || !q.scope || !q.key || !q.value) { return res.end('{}'); }
  Status.prototype._setStatus('status:/'+q.accountName+'/'+q.scope,
    {
      op: 'set',
      to: 'status:/'+q.accountName+'/'+q.scope,
      key: q.key,
      value: q.value,
    }, function(replies) {
      res.setHeader('Content-type', 'application/json');
      res.setHeader('Cache-Control', 'no-cache');
      res.end('{}');
  });
};

// curl -k "https://localhost/radar/status?accountName=test&scope=ticket/1"
function getStatus(req, res) {
  var parts = url.parse(req.url, true),
      q = parts.query;
  Status.prototype._getStatus('status:/'+q.accountName+'/'+q.scope, function(replies) {
    res.setHeader('Content-type', 'application/json');
    res.setHeader('Cache-Control', 'no-cache');
    res.end(JSON.stringify(replies));
  });
};

function setMessage(req, res, re, data) {
  var q = {};
  try {
    q = JSON.parse(data);
  } catch(e) { return res.end(); }
  if(!q || !q.accountName || !q.scope || !q.value) { return res.end('{}'); }
  var resourceName = 'message:/'+q.accountName+'/'+q.scope,
      opts = Type.getByExpression(resourceName);
  MessageList.prototype._publish(resourceName, opts.policy || {},
    {
      op: 'publish',
      to: 'message:/'+q.accountName+'/'+q.scope,
      value: q.value
    }, function() {
      res.setHeader('Content-type', 'application/json');
      res.setHeader('Cache-Control', 'no-cache');
      res.end('{}');
  });
};

function getMessage(req, res) {
  var parts = url.parse(req.url, true),
      q = parts.query;
  if(!q || !q.accountName || !q.scope) { return res.end(); }
  var resourceName = 'message:/'+q.accountName+'/'+q.scope,
      opts = Type.getByExpression(resourceName);
  MessageList.prototype._sync(resourceName, opts.policy || {}, function(replies) {
    res.setHeader('Content-type', 'application/json');
    res.setHeader('Cache-Control', 'no-cache');
    res.end(JSON.stringify(replies));
  });
};

// curl -k "https://localhost/radar/presence?accountName=test&scope=ticket/1"
// Version 1:
//  - Response for single scope: { userId: userType }
//  - Response for multiple scopes (comma separated): { scope: { userId: userType } }
// Version 2:
//  - Version number is required (e.g. &version=2)
//  - Response for single scope: { userId: { "clients": { clientId1: {}, clientId2: {} }, userType: }  }
//  - Response for multiple scopes: {  scope1: ... above ..., scope2: ... above ...  }
function getPresence(req, res) {
  var parts = url.parse(req.url, true),
      q = parts.query;
  if(!q || !q.accountName) { return res.end(); }
  if(!(q.scope || q.scopes)) { return res.end(); }
  // sadly, the responses are different when dealing with multiple scopes so can't just put these in a control flow
  if(q.scope) {
    var monitor = new RemoteManager('presence:/'+q.accountName+'/'+q.scope);
    monitor.fullRead(function(online) {
      res.setHeader('Content-type', 'application/json');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('X-Radar-Host', hostname);
      if(q.version == 2) {
        res.end(JSON.stringify(monitor.getClientsOnline())+'\n');
      } else {
        res.end(JSON.stringify(online)+'\n');
      }
    });
  } else {
    var scopes = q.scopes.split(','),
        result = {}; // key: scope - value: replies
    scopes.forEach(function(scope) {
      var monitor = new RemoteManager('presence:/'+q.accountName+'/'+scope);
      monitor.fullRead(function(online) {
        if(q.version == 2) {
          result[scope] = monitor.getClientsOnline();
        } else {
          result[scope] = online;
        }
        if (Object.keys(result).length == scopes.length) {
          res.setHeader('Content-type', 'application/json');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('X-Radar-Host', hostname);
          res.end(JSON.stringify(result)+'\n');
        }
      });
    });
  }
};

module.exports = {
  setStatus: setStatus,
  getStatus: getStatus,
  setMessage: setMessage,
  getMessage: getMessage,
  getPresence: getPresence
};
