TESTS = tests/*.test.js
REPORTER = spec

test:
	@export radar_log=-* && ./node_modules/.bin/mocha \
		--ui exports \
		--reporter $(REPORTER) \
		--slow 2000ms \
		--bail \
		$(TESTS)

# make test-one TEST=server/test/client.presence.test.js
test-one:
	@export radar_log=-* && ./node_modules/.bin/mocha \
		--ui exports \
		--reporter $(REPORTER) \
		--slow 2000ms \
		--bail \
		$(TEST)

reset-stats:
	redis-cli KEYS "radar:/audit/*" | xargs redis-cli DEL

read-stats:
	/opt/redis/redis-cli KEYS "radar:/audit/*" | xargs --verbose -n 1 /opt/redis/redis-cli GET

.PHONY: test reset-stats read-stats
