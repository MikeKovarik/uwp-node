import {EventEmitter} from 'events'
import {Socket} from 'net'
import {isNode, setupChannel} from './util.mjs'
import {createNamedPipe} from './util.mjs'


if (isNode) {

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
		// Cleanup the property after to prevent pollution of env vars.
		delete env['uwp-node-stdio-pipes']
	}

	// FD of the pipe used for Node style IPC
	if ('uwp-node-stdio-ipc' in env) {
		// Cleanup the property after to prevent pollution of env vars.
		var ipcFd = parseInt(env['uwp-node-stdio-ipc'])
		delete env['uwp-node-stdio-ipc']
		var ipcPipeName = stdioPipeNames[ipcFd]
		stdioPipeNames[ipcFd] = null
		// Attach the ipc stream to process, create process.send() method,
		// start handling incomming data and parsing it as 'message' events.
		// But only when and if either process.send() is called, or 'message'
		// event listened to.
		function setupIpc() {
			let ipcChannel = createNamedPipe(ipcPipeName)
			setupChannel(process, ipcChannel)
		}
		// Creating wrappers on process object, that will create IPC when they're called.
		var on = Symbol()
		process[on] = process.on
		process.on = (name, ...args) => {
			if (name === 'message') {
				// Reset original on() method.
				process.on = process[on]
				// Creates IPC channel and attaches .send(), .disconnect() method to process (via setupChannel).
				setupIpc()
			}
			// Make sure the listener is added.
			process[on](name, ...args)
		}
		process.send = message => {
			// Reset original on() method.
			process.on = process[on]
			// Creates IPC channel and attaches .send(), .disconnect() method to process (via setupChannel).
			setupIpc()
			process.send(message)
		}
		process.disconnect = () => {}
	}

	// Now we create the addition stdio pipes.
	// NOTE: these are not wrapped like IPC is and using these pipes will make the process run forever
	// if user doesn't explicitly kill the process. Attaching any kind of listener or maintaining net connection
	// prevents the process from closing. Node by default wraps the pipes and if they're not listened to it will
	// not block closing. This behavior is not yet replicated (not sure if easily possible).
	if (stdioPipeNames) {
		stdioPipeNames.forEach((pipeName, fd) => {
			if (fd <= 2) return
			stdio.push(pipeName && createNamedPipe(pipeName))

		})
	}

}
