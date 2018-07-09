var cp = require('child_process')
var {compileIfNeeded} = require('./testerCompiler.js')
var mockUwp = require('./uwpMock.js')
var {spawn, exec, broker} = require('../index.js')


global.spawn = spawn
global.exec = exec


process.on('unhandledRejection', (reason, p) => {
	console.error(reason, 'Unhandled Rejection at Promise', p)
})
process.on('uncaughtException', err => {
	console.error(err, 'Uncaught Exception thrown')
	process.exit(1)
})


describe('uwp-node UWP mocked in console', function() {

	this.timeout(10 * 1000)
	before(async () => {
		await compileIfNeeded()
		await mockUwp()
	})

	after(() => {
		broker.kill()
	})

	require('./testCases.js')

})
