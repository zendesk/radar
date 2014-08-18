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
