ENV = test
REPORTER = spec
BIN = node_modules/.bin
SRC_FILES = $(shell find .  -type f \( -name "*.js" ! \
	-path "*node_modules*" ! -path "*lcov-report*" \))

# Use grep to run only tests with keywords:
# make test-server GREP=events
ifeq ($(GREP), )
	GREP_CMND =
else
 	GREP_CMND = --grep $(GREP)
endif

MOCHA-OPTS = --reporter $(REPORTER) \
		--require chai \
		--ui bdd \
		--recursive \
		--colors

test: jshint
	@NODE_ENV=$(ENV) $(BIN)/mocha \
		$(MOCHA-OPTS) \
		$(GREP_CMND)
.PHONY: test

jshint:
	@$(BIN)/jshint $(SRC_FILES)

## Coverage:

test-coverage:
	@NODE_ENV=test $(BIN)/istanbul cover $(BIN)/_mocha -- $(MOCHA-OPTS)
.PHONY: test-coverage

check-coverage: test-coverage
	@$(BIN)/istanbul check-coverage --function 80 --branch 80 --statement 80 --lines 92
.PHONY: check-coverage
