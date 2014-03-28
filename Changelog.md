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
