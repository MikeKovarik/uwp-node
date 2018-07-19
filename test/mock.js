var cp = require('child_process')
var {compileIfNeeded} = require('./testerCompiler.js')
require('./uwpMock.js')
var {spawn, exec, broker} = require('../index.js')

global.spawn = spawn
global.exec = exec
global.isMock = true


process.on('unhandledRejection', (reason, p) => {
	console.error('Unhandled Rejection\n', reason)
})
process.on('uncaughtException', err => {
	console.error('Uncaught Exception thrown\n', err)
	process.exit(1)
})

describe('uwp-node UWP mocked in console', function() {

	before(async () => {
		await compileIfNeeded()
		await Windows.ApplicationModel.FullTrustProcessLauncher.launchFullTrustProcessForCurrentAppAsync()
	})

	after(() => {
		// TODO: delete this line once internal IPC (IIPC) works and kill() can work on its own.
		broker.connection && broker.connection.proc && broker.connection.proc.kill()
		broker.kill()
	})

	require('./tests.js')

})
