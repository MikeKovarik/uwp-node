require('../../node.js')

var listener = message => {
	console.log(JSON.stringify(message))
}
process.once('message', listener)

setTimeout(() => process.removeListener('message', listener), 500)