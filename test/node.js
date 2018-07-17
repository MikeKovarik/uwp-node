var util = require('util')
var {spawn, exec} = require('child_process')

global.spawn = spawn
global.exec = util.promisify(exec)


process.on('unhandledRejection', (reason, p) => {
	console.error(reason, 'Unhandled Rejection at Promise', p)
})
process.on('uncaughtException', err => {
	console.error(err, 'Uncaught Exception thrown')
	process.exit(1)
})


describe('uwp-node native testbench', function() {

	require('./tests.js')

})
