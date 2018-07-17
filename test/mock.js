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

before(done => {
	compileIfNeeded()
		.then(() => mockUwp())
		.then(() => done())
})
/*
after(() => {
	broker.kill()
	broker.connection.proc.kill()
})
*/
describe('uwp-node UWP mocked in console', function() {

	require('./tests.js')

})
