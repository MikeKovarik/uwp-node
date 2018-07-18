require('../../node.js')
process.once('message', message => {
	console.log(JSON.stringify(message))
	process.exit(0)
})