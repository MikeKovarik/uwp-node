require('uwp-node')


console.log(`Node ${process.version}`)
//console.log(`cwd ${process.cwd()}`)
console.log('send' in process ? 'has IPC' : 'no IPC')
console.log('console.log goes to stdout')
console.error('console.error goes to stderr')

setTimeout(() => {
	console.log('console.log timeout')
}, 1000)

setTimeout(() => {
	console.error('console.error timeout')
}, 1500)
/*
setInterval(() => {
	console.log('log this every 5 seconds')
}, 5 * 1000)
*/

setTimeout(commitSudoku, 2000)

function commitSudoku() {
	process.kill(process.pid)
}

/*var readline = require('readline')
var rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout
})
rl.on('line', (input) => {
	console.log(`STDIN Received: ${input}`);
})
*/