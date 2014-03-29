module.exports = {
  // default (optional)
  // Will fallback to localhost:6379
  redis_host: 'localhost',
  redis_port: 6379,

  // (optional) Only usable if you define use_connection.
  // Lets you specify a number of redis options and pick one.
  connection_settings: {
    legacy: {
      redis_host: 'localhost',
      redis_port: 6379
    },
    cluster1: {
      // sentinel master name is required
      id: 'mymaster',
      sentinels: [
      {
        host: 'localhost',
        port: 26379
      }]
    },
    cluster2: {
      id: 'mymaster',
      sentinels: [
      {
        host: 'localhost',
        port: 36379
      },
      {
        host: 'localhost',
        port: 36380
      },
      {
        host: 'localhost',
        port: 36381
      }]
    }
  },

  // Only used if a connection_settings hash is present.
  // (optional). will fallback to default if not present.
  //use_connection: 'cluster1',

  //Radar config: Port for radar to run on.
  port: 8000,

  //Radar config: (optional), not currently set, interval for datadog reporting
  healthReportInterval: 10000,
};

