require('../node.js')
var ipcEnabled = !!process.send
console.log('i am child', ipcEnabled ? 'with IPC' : 'without IPC')
console.log('child process.channel.fd', process.channel && process.channel.fd)
console.log('child pid', process.pid, `(parent ${process.ppid})`)
console.error('child cries')
if (ipcEnabled) {
	process.send('IPC message over process.send() from child')
	process.once('message', message => console.log(message))
}
console.log(process)

//var net = require('net')
//var ipcSocket = new net.Socket({fd: 3})
//ipcSocket.on('data', buffer => console.log(buffer.toString()))