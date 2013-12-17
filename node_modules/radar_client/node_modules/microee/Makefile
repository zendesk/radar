build:
	@echo ';(function(module) {' > ./dist/microee.js
	@cat index.js >> ./dist/microee.js
	@echo 'microee = module.exports;' >> ./dist/microee.js
	@echo '}({}));' >> ./dist/microee.js
	@echo 'Wrote ./dist/microee.js'

test:
	@./node_modules/.bin/mocha \
	--ui exports \
	--reporter spec \
	--slow 2000ms \
	--bail \
	test/microee.test.js

.PHONY: build test

