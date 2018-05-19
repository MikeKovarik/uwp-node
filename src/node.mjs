import fs from 'fs'
import net from 'net'
import path from 'path'
import stream from 'stream'
import {EventEmitter} from 'events'
import {isNode, setupChannel} from './util.mjs'

export {systray} from './systray.mjs'


if (isNode) {

	var ipc = false
	var {env} = process
	var additionalStdio
	if (env['uwp-node-stdio']) {
		additionalStdio = env['uwp-node-stdio'].split(',')
		console.log('## stdio', additionalStdio)
		//additionalStdio.map(openNamedPipe)
	}

	// FD of the pipe used for Node style IPC
	if (env['uwp-node-ipc'])
		createIpc(parseInt(env['uwp-node-ipc']))

	// Name of the pipe used by uwp-node for internal messages
	if (env['uwp-node-internal-ipc']) {
		var pipeName = env['uwp-node-internal-ipc']
		// TODO
	}

	// Parent process PID
	if (env['uwp-node-ppid'])
		process.ppid = parseInt(env['uwp-node-internal-ipc'])

	var ipcPipeStream
	var internalIpcPipeStream

	function createIpc(fd) {
		//var stream = new net.Socket({fd})
		//stream.once('data', buffer => console.log('## IPC data: ' + buffer))
		//stream.write('hai back from module')

		var pipePath = path.join('\\\\.\\pipe\\', additionalStdio[fd - 3])
		var fd = fs.openSync(pipePath, 'r+')
		var ipcPipeStream = fs.createReadStream(null, {fd})
		ipcPipeStream.once('data', buffer => console.log('## IPC data 2: ' + buffer))
	return
		console.log('&& createIpc', fd, pipePath)
		var ipcPipeStream = net.createConnection(pipePath)
		ipcPipeStream.on('connect', () => console.log('## client connected to server'))
		ipcPipeStream.on('data', data => console.log('## on data:', data.toString()))

		//createIpcChannel(process, fd, ipcPipeStream)
		//setupChannel(process, stream)
		ipc = true
	}

	// TODO: change this. parent doesnt know child's pid before its launched
	function getFullPipeName(fd) {
		return `\\\\.\\pipe\\uwp-node-${fd}-${process.pppid}-${process.ppid}`
		//return `\\\\.\\pipe\\uwp-node-${handle}-${process.ppid}`
	}

	function openNamedPipe(pipeName) {
		var pipePath = path.join('\\\\.\\pipe\\', pipeName)
		var fd = fs.openSync(pipePath, 'w+')
		console.log('## created fd', fd)
	}


	function sendInternalMessage(object) {
		var json = JSON.stringify(object)
		internalIpcPipeStream.write(json)
	}

}
