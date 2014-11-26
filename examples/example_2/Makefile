build:
	@echo 'Building public/radar_client.js'
	@mkdir -p public
	@cat ./node_modules/radar_client/node_modules/minilog/dist/minilog.js > public/radar_client.js
	@cat ./node_modules/radar_client/node_modules/engine.io-client/engine.io.js >> public/radar_client.js
	@cat ./node_modules/radar_client/dist/radar_client.js >> public/radar_client.js
	# uncomment if you want to use uglifyJS to further minify the file
	# @uglifyjs --overwrite public/radar_client.js
	@echo 'Wrote public/radar_client.js'

.PHONY: build
