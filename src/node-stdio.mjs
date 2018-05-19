import {EventEmitter} from 'events'
import {Socket} from 'net'
import {isNode, setupChannel, handleStreamJson} from './util.mjs'


export var nodeUwpIpc

if (isNode) {

	// Parent process PID
	if (env['uwp-node-ppid'])
		process.ppid = parseInt(env['uwp-node-internal-ipc'])

	var ipc = false
	var {env} = process
	var additionalStdio
	if (env['uwp-node-stdio']) {
		additionalStdio = env['uwp-node-stdio'].split(',')
		console.log('## stdio', additionalStdio)
		//additionalStdio.map(openNamedPipe)
	}

	// FD of the pipe used for Node style IPC
	if (env['uwp-node-ipc']) {
		var fd = parseInt(env['uwp-node-ipc'])
		setupChannel(process, channel)
	}

	// Name of the pipe used by uwp-node for internal messages
	if (env['uwp-node-internal-ipc']) {
		var pipeName = env['uwp-node-internal-ipc']
		// TODO
		handleStreamJson()
		nodeUwpIpc = new EventEmitter
	}

	function createNamedPipe(name) {
		var fullName = getFullPipeName(name)
		var channel = new Socket
		channel.connect(fullName)
		return channel
	}

	function getFullPipeName(name) {
		return `\\\\.\\pipe\\uwp-node\\${name}-${process.pppid}`
	}

}
