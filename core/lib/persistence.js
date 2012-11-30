var redisLib = require('redis'),
    logging = require('minilog')('persistence'),
    // defaults
    configuration = {
      redis_host: 'localhost',
      redis_port: 6379
    };

var client, isConnecting = false;

function redis() {
  if(client == undefined || !client.connected){
    if(client && !client.connected && isConnecting) {
      logging.info('Not reinitializing client, as a connect is in progress');
      return client;
    }
    isConnecting = true;
    client = redisLib.createClient(configuration.redis_port, configuration.redis_host);
    if (configuration.redis_auth) {
      client.auth(configuration.redis_auth);
    }
    client.once('ready', function() {
      isConnecting = false;
    });
    logging.info('Created new Redis client.');
  }
  return client;
}

function Persistence() { };

Persistence.setConfig = function(config) {
  configuration = config;
};

Persistence.applyPolicy = function(multi, key, policy) {
  if(policy.maxCount) {
    multi.zremrangebyrank(key, 0, -policy.maxCount-1, function(err, res) {
      logging.info('Enforce max count: '+(0-policy.maxCount-1)+' removed '+res);
      if(err) throw new Error(err);
    });
  }

  if(policy.maxAgeSeconds) {
    var maxScore = new Date().getTime()-policy.maxAgeSeconds * 1000;
    multi.zremrangebyscore(key, 0, maxScore, function(err, res) {
      logging.info('Enforce max age ('+key+'): '+new Date(maxScore).toUTCString()+' removed '+res);
      if(err) throw new Error(err);
    });
  }
};

Persistence.readOrdered = function(key, policy, callback) {
  var multi = redis().multi();

  switch(arguments.length) {
    case 3:
      policy && Persistence.applyPolicy(multi, key, policy);
      break;
    case 2:
      callback = policy; // policy is optional
  }

  // sync up to 100 messages, starting from the newest
  multi.zrange(key, -100, -1, function (err, replies) {
    logging.info(key+' '+replies.length + " items to sync");
    callback(replies);
  });

  multi.exec();
};

Persistence.readOrderedWithScores = function(key, policy, callback) {
  var multi = redis().multi();

  switch(arguments.length) {
    case 3:
      policy && Persistence.applyPolicy(multi, key, policy);
      break;
    case 2:
      callback = policy; // policy is optional
  }

  // sync up to 100 messages, starting from the newest
  multi.zrange(key, -100, -1, 'WITHSCORES', function (err, replies) {
    if(err) throw new Error(err);
    logging.info(key+' '+ (replies.length /2) + " items to sync");
    callback(replies);
  });

  multi.exec();
};

Persistence.persistOrdered = function(key, value, callback) {
  redis().zadd(key, new Date().getTime(), value, callback);
};

Persistence.delWildCard = function(expr, callback) {
  redis().keys(expr, function(err, results) {
    if(err) throw new Error(err);
    var counter = 0;
    if(results.length == 0) {
      return callback();
    }
    results.forEach(function(key) {
      redis().del(key, function() {
        counter++;
        if (counter == results.length) {
          callback();
        }
      });
    });
  });
};

Persistence.del = function(key, callback) {
  redis().del(key, callback);
};

Persistence.readHash = function(hash, key, callback) {
  redis().hget(hash, key, function (err, replies) {
    if(err) throw new Error(err);
    callback(replies);
  });
};

Persistence.readHashAll = function(hash, callback) {
  redis().hgetall(hash, function (err, replies) {
    if(err) throw new Error(err);
    callback(replies);
  });
};

Persistence.persistHash = function(hash, key, value) {
  logging.info('persistHash:', hash, key, value);
  redis().hset(hash, key, value, Persistence.handler);
};

Persistence.expire = function(key, seconds) {
  redis().expire(key, seconds, Persistence.handler);
};

Persistence.deleteHash = function(hash, key) {
  logging.info('deleteHash:', hash, key);
  redis().hdel(hash, key, Persistence.handler);
};

Persistence.publish = function(key, value, callback) {
  logging.info('Redis pub:', key, value);
  redis().publish(key, value, callback);
};

Persistence.disconnect = function(callback) {
  if(client) {
    client.quit(function() {
      setTimeout(function() { callback && callback(); }, 1);
    });
  } else {
    setTimeout(function() { callback && callback(); }, 1);
  }
};

Persistence.keys = function(key, callback) {
  redis().keys(key, callback);
};

Persistence.handler = function(err) {
  if (err) {
    logging.error('Error: ' + err);
  }
};

Persistence.incrby = function(key, incr) {
  redis().incrby(key, incr, Persistence.handler);
};

module.exports = Persistence;
