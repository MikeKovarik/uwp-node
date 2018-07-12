var cp = require('child_process')
var {compileIfNeeded} = require('./testerCompiler.js')
var mockUwp = require('./uwpMock.js')
var {spawn, exec, broker} = require('../index.js')


global.spawn = spawn
global.exec = exec


process.on('unhandledRejection', (reason, p) => {
	console.error('Unhandled Rejection\n', reason)
})
process.on('uncaughtException', err => {
	console.error('Uncaught Exception thrown\n', err)
	process.exit(1)
})


describe('uwp-node UWP mocked in console', function() {

	this.timeout(5 * 1000)
	before(async () => {
		await compileIfNeeded()
		await mockUwp()
	})

	after(() => {
		broker.kill()
		broker.connection.proc.kill()
	})

	require('./tests.js')

})
