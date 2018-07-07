var {spawn} = require('child_process')


var stdio = ['inherit', 'inherit', 'inherit', 'ipc']
var child = spawn('node', ['child-simple.js'], {stdio})

console.log('parent pid', process.pid)
console.log('child pid', child.pid)

child.once('message', buffer => console.log(buffer.toString()))
child.send('IPC message over child.send() from parent')