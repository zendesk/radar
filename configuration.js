module.exports = {
  // Default (optional)
  // Will fallback to localhost:6379
  redis_host: 'localhost',
  redis_port: 6379,

  // (Optional) Only usable if you define use_connection.
  // Lets you specify a number of redis options and pick one.
  connection_settings: {
    legacy: {
      host: 'localhost',
      port: 6379
    },
    cluster1: {
      // Sentinel master name is required
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
  // (Optional). will fallback to default if not present.
  //use_connection: 'legacy',

  // Radar config: Port for radar to run on.
  port: 8000,

  // TTL for data stored on the server, in seconds (86400 = 1 day)
  clientDataTTL: 86400
};
