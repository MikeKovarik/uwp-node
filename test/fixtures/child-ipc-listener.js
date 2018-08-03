require('../../node.js')

process.once('message', message => {
	console.log(JSON.stringify(message))
	process.exit(0)
})

/*
var listener = message => {
	console.log(JSON.stringify(message))
	process.removeListener('message', listener)
}
process.once('message', listener)
*/