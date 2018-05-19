var fs = require('fs')
var path = require('path')
var net = require('net')
var {spawn} = require('child_process')


var ipcFd = 3
var customPipeNames = ['mypipe']

// Create the servers, this is real app done in C# part of the module.
var servers = customPipeNames
	.map(pipeName => {
		var server = net.createServer()
		var pipePath = path.join('\\\\.\\pipe\\', pipeName)
		server.listen(pipePath)
		return server
	})

// additional custom uwp-node's created with named-pipes
var env = {
	'uwp-node-ipc': ipcFd,
	'uwp-node-stdio': customPipeNames.join(','),
}
// default node's STDIO
var stdio = 'inherit'
// spawn the process
var child = spawn('node', ['child-simple.js'], {env, stdio})

console.log('parent pid', process.pid)

child.once('message', buffer => console.log(buffer.toString()))
//child.send('IPC message over child.send() from parent')

// deleteme
servers[0].once('connection', client => client.write(JSON.stringify({hello: 'world'}) + '\n'))