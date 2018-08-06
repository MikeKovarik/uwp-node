var {broker} = require('../../node.js')

broker.once('custom-event', message => {
	process.stdout.write(message)
	process.exit(0)
})

// broker object and the socket beneath it is unrefed so it doesn't block process from exitting.
// Here we need to artificially prolong this script's uptime.
setTimeout(() => {}, 1500)