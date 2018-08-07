var cp = require('child_process')
var {compileIfNeeded} = require('./testerCompiler.js')
require('./uwpMock.js')
var {spawn, exec, broker} = require('../index.js')

global.spawn = spawn
global.exec = exec
global.broker = broker
global.isMock = true


process.on('unhandledRejection', (reason, p) => {
	console.error('Unhandled Rejection\n', reason)
})
process.on('uncaughtException', err => {
	console.error('Uncaught Exception thrown\n', err)
	process.exit(1)
})

describe('uwp-node UWP mocked in console', function() {

	this.timeout(4000)

	// sigh. mocha doesn't really respect the promise returned by before()
	var exitted = false
	var compiling = false

	before(async () => {
		compiling = true
		await compileIfNeeded()
		compiling = false
		await Windows.ApplicationModel.FullTrustProcessLauncher.launchFullTrustProcessForCurrentAppAsync()
		if (exitted)
			process.exit(0)
	})

	after(() => {
		exitted = true
		// TODO: delete this line once internal IPC (IIPC) works and kill() can work on its own.
		broker.connection && broker.connection.proc && broker.connection.proc.kill()
		broker.kill()
		if (!compiling)
			setTimeout(() => process.exit(0), 200)
	})

	require('./tests.js')

})
