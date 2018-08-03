var {broker} = require('../../node.js')

broker.once('message', message => {
	process.stdout.write(message)
	process.exit(0)
})