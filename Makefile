TESTS += api/test/radar.test.js

TESTS += core/test/resources/persistence.test.js
TESTS += core/test/resources/message_list.test.js
TESTS += core/test/resources/presence.test.js
TESTS += core/test/resources/presence.remote.test.js
TESTS += core/test/resources/status.test.js

TESTS += server/test/client.chat.test.js
TESTS += server/test/client.presence.test.js
TESTS += server/test/client.reconnect.test.js
TESTS += server/test/client.test.js
TESTS += server/test/client.watch.test.js

TESTS_ALL = $(find . -type f -name '*.test.js' | grep -v 'node_modules' | sort)
REPORTER = spec

test:
	@export radar_log=-* && ./node_modules/.bin/mocha \
		--ui exports \
		--reporter $(REPORTER) \
		--slow 2000ms \
		--bail \
		$(TESTS)

reset-stats:
	redis-cli KEYS "radar:/audit/*" | xargs redis-cli DEL

read-stats:
	/opt/redis/redis-cli KEYS "radar:/audit/*" | xargs --verbose -n 1 /opt/redis/redis-cli GET

.PHONY: test reset-stats read-stats
