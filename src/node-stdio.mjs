import {EventEmitter} from 'events'
import {Socket} from 'net'
import {isNode, setupChannel} from './util.mjs'
import {createNamedPipe} from './util.mjs'


if (isNode) {

	// NOTE: Cleanup all custom uwp- prefixed properties to prevent pollution of env.
	var {env} = process

	// Apply parent process PID.
	if ('uwp-node-ppid' in env) {
		process.ppid = parseInt(env['uwp-node-ppid'])
		delete env['uwp-node-ppid']
	}

	//var stdio = [process.stdin, process.stdout, process.stderr]
	var stdio = [null, null, null]
	var stdioPipeNames = [null, null, null]
	if ('uwp-node-stdio-pipes' in env) {
		stdioPipeNames.push(...env['uwp-node-stdio-pipes'].split('|'))
		delete env['uwp-node-stdio-pipes']
	}

	// FD of the pipe used for Node style IPC
	if ('uwp-node-stdio-ipc' in env) {
		var ipcFd = parseInt(env['uwp-node-stdio-ipc'])
		delete env['uwp-node-stdio-ipc']
		var ipcPipeName = stdioPipeNames[ipcFd]
		stdioPipeNames[ipcFd] = null
		let ipcChannel = createNamedPipe(ipcPipeName)
		setupChannel(process, ipcChannel)
	}

	// Now we create the addition stdio pipes.
	stdioPipeNames
		.filter((pipeName, fd) => fd > 2)
		.filter(pipeName => !!pipeName)
		.forEach(pipeName => stdio.push(createNamedPipe(pipeName)))

}
