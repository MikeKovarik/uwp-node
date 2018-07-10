require('../../node.js')
var obj = {
	connected: process.connected,
	channel: typeof process.channel,
	send: typeof process.send,
	disconnect: typeof process.disconnect,
}
console.log(JSON.stringify(obj))