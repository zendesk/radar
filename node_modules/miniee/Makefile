build:
	@./node_modules/.bin/browserbuild \
		-f miniee.js \
		-m miniee \
		-g miniee \
		miniee.js

test:
	@./node_modules/.bin/mocha \
		--ui exports \
		--reporter spec \
		--slow 2000ms \
		--bail \
		test/miniee.test.js

.PHONY: build test

