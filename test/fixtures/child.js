require('../../node.js')
console.log('child process.channel.fd', process.channel && process.channel.fd)
console.log('child pid', process.pid, `(parent ${process.ppid})`)
console.error('child cries')
if (ipcEnabled) {
	process.send('IPC message over process.send() from child')
	process.once('message', message => console.log(message))
}