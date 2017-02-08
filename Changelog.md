### 0.21.8
* [PR #236](https://github.com/zendesk/radar/pull/236) - Api status set: unsubscribe if list of subscribers is empty

### 0.21.7
* [PR #235](https://github.com/zendesk/radar/pull/235) - Support parsing ServiceInterfaceClient session id form http header

### 0.21.6
* [PR #234](https://github.com/zendesk/radar/pull/234) - Lower "type not found" log level from error -> warn

### 0.21.5
* [PR #233](https://github.com/zendesk/radar/pull/233) - Allow charset in ServiceInterface content-type
* [PR #231](https://github.com/zendesk/radar/pull/231) - Extract class: ServiceInterfaceClientSession

### 0.21.4
* [PR #228](https://github.com/zendesk/radar/pull/228) - Add bin/server.js to package.json bin

### 0.21.3
* [PR #229](https://github.com/zendesk/radar/pull/229) - Initialize Sentry id with Server id

### 0.21.2
* [PR #227](https://github.com/zendesk/radar/pull/227) - Don't delete presence_store when disposing presence resource
* [PR #226](https://github.com/zendesk/radar/pull/226) - fix readme

### 0.21.1 - known bad, do not deploy
* [PR #224](https://github.com/zendesk/radar/pull/224) - Replace underscore with lodash
* [PR #225](https://github.com/zendesk/radar/pull/225) - Cleanup directory structure

### 0.21.0
* [PR #223](https://github.com/zendesk/radar/pull/223) - Return Server#ready promise from Server#attach
* [PR #222](https://github.com/zendesk/radar/pull/222) - Forward sentry events on server
* [PR #221](https://github.com/zendesk/radar/pull/221) - Disable eslint in codeclimate

### 0.20.0
* [PR #219](https://github.com/zendesk/radar/pull/219) - Avoid blocking iteration on large collections
* [PR #218](https://github.com/zendesk/radar/pull/218) - Skip message on ClientSession#send if ClientSession is ended
* [PR #217](https://github.com/zendesk/radar/pull/217) - Log when missing transport on ClientSession.prototype.send
* [PR #204](https://github.com/zendesk/radar/pull/204) - Implement SessionManager

### 0.19.1
* [PR #210](https://github.com/zendesk/radar/pull/210) - Server: Emit resource:destroy event
* [PR #206](https://github.com/zendesk/radar/pull/206) - Add npm version badge to readme

### 0.19.0
* [PR #203](https://github.com/zendesk/radar/pull/203) - HTTP ServiceInterface
* [PR #202](https://github.com/zendesk/radar/pull/202) - Add memory leak regression tests for ClientSessions
* [PR #200](https://github.com/zendesk/radar/pull/200) - Cleanup package.json
* [PR #201](https://github.com/zendesk/radar/pull/201) - Spruce up the readme a bit

### 0.18.0
Switched to http://standardjs.com/ style
* #195, #197 - format for standard
* #199 - Extract server setup into components
* #198 - Encapsulate socket in client (add ClientSession class)

### 0.17.1
* #193 - Cleanup - reorganize Resources files
* #194 - Support incoming BatchMessage in server
* #196 - Fix typo when soft limiting

### 0.17.0
* Introduce middleware runner.

  Use ./middleware/quota_manager.js as a middleware example.

* Extract rate/quota management into QuotaManager middleware (disabled by default)
* Extract legacy authorization into LegacyAuthManager middleware (disabled by default)
  
  After upgrading to 0.17.0, current authorization and quota limiting code will be 
  be disabled. To enable it, you will have to explicitely add the specific functionality,
  like this:

      var Radar = require('radar'),
          LegacyAuthManager = Radar.middleware.LegacyAuthManager,
          server;

      server = new Radar();
      server.use(new LegacyAuthManager()); // For legacy authentication. 
      server.attach(...);



### 0.16.8
* Pin dependencies in package.json
* Upgrade to persistence@1.0.5

### 0.16.7
* Add ability to log abuse on subscriptions without preventing it. 

### 0.16.6
* Disable client state save on Redis. 
* Changes to fix storeData bug in client.js

### 0.16.5
* Fix client store data by not storing the full messages on redis.

### 0.16.4
* Replace resource "name" with "to" for naming consistency

### 0.16.3
* Disable client state save

### 0.16.2
* Stamp incoming and outgoing messages

### 0.16.1
* Stop including 'alive' attribute on sentry keep-alive messages
* Remove loadData from server-side client init
* Added better logging of incoming and outgoing messages. 

### 0.16.0
* require persistence >= 1.0.3
* remove auto pub
* reimplement Sentry so it doesn't rely on pubsub for updates and down events. 
* stamp messages with id, sentryId and clientId.

### 0.15.9
* Responde with an error when a message with an unknown type is received.

### 0.15.8 
* Emit events on new resource allocation, and on esch incoming/outgoing message 
  processed by resources. 

### 0.15.7
* Presence resource can set online and include client data (to be broadcasted
  as part of the client_online and client_updated events). 

### 0.15.6
* Fix Radar pushed using old npm version (no code changes).

### 0.15.5
* Fix Server counts SYNC like SUBSCRIBE when rate limiting. 

### 0.15.4
* Fix RateLimiter#remove to avoid 'Cannot convert null to object'. 

### 0.15.3
* Allow Server and RateLimiter to emit events related to the former. 

### 0.15.2
* Load from persistence client data on receipt of the *nameSync* message
  - apply *subscriptions* and *presences* from the restored client data
  - this is related to code release in 0.14.0

### 0.15.1
* Fix configuration not being passed back properly after setting up persistence 
  connection.
* Remove .node-version included by mistake.

### 0.15.0
* Add new configuration support. 
  - Configuration can be specified from configuration.js file (legacy),
    environment and cli. Run `node server --help` to see supported options. 

### 0.14.2
* Update Changelog.md to be current
  - Bumped version of radar now matches that of radar_client

### 0.14.1
* Update dev dependency for radar_client to * (from 0.14.0)
  (Note: Changelog.md was not current in the 0.14.1 release)

### 0.14.0
* Add server side client state
  - Initial code refactoring
    - do not use the naked _me reference
    - Identify APIs as public/private by
    - prefixing with _ (e.g. _handleClientMessage) where appropriate
    - regrouping of APIs in source files into public/private groups
    - rename APIs where needed (all private APIs)
    - expand comments minimally to clarify purpose of APIs
  - Change Auth to work on messages rather than on resources
  - Add Client module
  - Add nameSync message
  - Persist client data on the server, with client data TTL
  - Additional refactoring of server/server.js
  - Add use of semver
  - In many places, replace old *client* with *socket* for the sake of clarity

### 0.13.1
* Code cleanup
  - comment capitalization, comment line length, code line length
  - minor code standardization, minor test code cleanup

### 0.13.0
* Set(online) for presence no longer subscribes to the resource.
    - This is a breaking change if the client assumes this behavior
* Fix error where sentryDownForClient sometimes fails on undefined store reference

### 0.12.5
* Expose details of sentry down in the listener

### 0.12.4
* Replace tight loops in clientsForSEntry with chained calls, for sentry down

### 0.12.3
* Update Sentry to contain host/port members
- Log name, host, port when Sentry is down

### 0.12.2
* Presence: sentry down does not publish presence offlines to redis
 - This should prevent large number of redis messages when a sentry fails

### 0.12.1
* Use radar_client 0.12.1

### 0.12.0
* Use engine.io 1.4.2, use radar_client 0.12.0

### 0.11.1
* Presence: UserExpiry timeout is now configurable based on resource type

### 0.11.0
* Stream resource
    - Uses an underlying list (with auto incrementing id) abstraction
    - push: add a message
    - get(from: x) - get all messages from id x
    - subscribe(from: x) - get all messages from id x as notifications

### 0.10.1
* Bugfix: Fix immediate disconnects after set(online) causing incorrect online messages
    - Rewrite all presence tests to be simpler/readable by extracting asserts into a helper
    - Add several new edgecase tests

### 0.10.0
* use latest radar_client with async message emits

### v0.9.3
* Perform a prepublish check for dirty working tree or outdated dependencies

### v0.9.2
* Fix crash: an unsubscribe after sync may cause issues
 - Handle cleanup of redis reply correctly

### v0.9.1
* upgrade engine.io to 1.3.1
* radar_client @ 0.9.1

### v0.9.0
* bad tag

### v0.8.3
* Unlimited listeners for sentry down event

### v0.8.2
* Fix userData for user_online

### v0.8.1
* Bugfix - Sync (v1/v2) needs to send notifications
  - Make v2 primary test targe
  - Fix tests so that redis hash order does not fail us

### v0.8.0
* Presence refactor; checkout readme file in core/lib/resources/presence
* Logging is streamlined.
* More integration tests around remote radar server messages

### v0.7.2
* Test with persistence 0.3.0

### v0.7.1
* Use latest persistence always (currently @0.2.0)

### v0.7.0
* Use minilog 2.0.5

### v0.6.0
* use radar_client 0.3.1

### v0.5.6
* persistence@0.1.1
 - Makes redis methods easily exposed

### v0.5.5
* extract persistence into separate package

### v0.5.4
* revert async loops from v0.5.0

### v0.5.3
* #76 - Bugfix: Do not fallback to localhost:6379 when reading redis host/port

### v0.5.2
* #74 - Fix configuration.js parsing, fail on unexpected config

### v0.5.1
* #72 - Use simple_sentinel for starting sentinel for testing
* #71 - Use redis-sentinel-client @0.1.5 (Forward pmessages always)

### v0.5.0
* Redis client update to 0.10.1
* Trust redis to queue subscriptions
* Clear persistence in tests
* Prevent more blocking forEach loops

### v0.4.2
* Do not wait for subscription callback from redis client

### v0.4.1
* Subscribe to redis channels only when needed

### v0.4.0
* Support for new configuration.js

### v0.3.3
* reduce verbosity of Persistence.js

### v0.3.2
Use appropriate file for API require
* Never send a null value in a get response for a status

### v0.3.1

* Workaround minilog bug (stop printing objects with circular references)

### v0.3.0

* Harmonize the auth mechanism around the use of an authProvider

### v0.2.3

* Bugfix: remove audit.js module to eliminate memory leak

### v0.2.2

* Updated sentinel configuration: multiple sentinel hosts/ports

### v0.2.1

* Bugfix: use sentinel for pubsub as well

### v0.2.0

* Initial support for sentinel using redis-sentinel-client

### v0.1.8

* Code refactor
