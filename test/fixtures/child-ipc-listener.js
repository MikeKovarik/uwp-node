require('../../node.js')
process.on('message', message => {
	console.log(message)
})