var {spawn, exec} = require('child_process')


global.spawn = spawn
global.exec = exec


process.on('unhandledRejection', (reason, p) => {
	console.error(reason, 'Unhandled Rejection at Promise', p)
})
process.on('uncaughtException', err => {
	console.error(err, 'Uncaught Exception thrown')
	process.exit(1)
})


describe('uwp-node native testbench', function() {

	require('./testCases.js')

})
