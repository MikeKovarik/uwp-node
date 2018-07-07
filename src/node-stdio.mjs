import {EventEmitter} from 'events'
import {Socket} from 'net'
import {isNode, setupChannel} from './util.mjs'
import {createNamedPipe} from './util.mjs'


if (isNode) {
	
	var {env} = process

	// Apply parent process PID.
	if (env['uwp-node-ppid']) {
		process.ppid = parseInt(env['uwp-node-ppid'])
		delete env['uwp-node-ppid']
	}

	//var stdio = [process.stdin, process.stdout, process.stderr]
	var stdio = [null, null, null]
	if (env['uwp-node-stdio-pipes']) {
		var pipeNames = env['uwp-node-stdio-pipes'].split('|')
		// Cleanup the property after to prevent pollution of env vars.
		delete env['uwp-node-stdio-pipes']
		stdio.push(...pipeNames.map(createNamedPipe))
	}

	// FD of the pipe used for Node style IPC
	if (env['uwp-node-stdio-ipc']) {
		// Cleanup the property after to prevent pollution of env vars.
		var fd = parseInt(env['uwp-node-stdio-ipc'])
		delete env['uwp-node-stdio-ipc']
		// Attach the ipc stream to process, create process.send() method,
		// start handling incomming data and parsing it as 'message' events.
		let ipcChannel = stdio[fd]
		if (ipcChannel)
			setupChannel(process, ipcChannel)
	}

}
