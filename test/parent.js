var cp = require('child_process')


var childScript = 'child-simple.js'

//var stdio = [0, 1, 2, 'ipc']
//var stdio = [0, 'pipe', 2]
//var stdio = undefined
var stdio = ['pipe', 'pipe', 'pipe', 'ipc']
var proc = cp.spawn('node', [childScript], {stdio})
proc.stdout.on('data', buffer => console.log('out>', buffer.toString()))
proc.once('close', (code, signal) => console.log('close', code, signal))
proc.once('exit', (code, signal) => console.log('exit', code, signal))
console.log('parent pid', process.pid)
console.log('child pid', proc.pid)

proc.once('message', message => {
	console.log('PARENT got message:', message)
})
proc.send({ foo: 'bar', baz: NaN })