import {EventEmitter} from 'events'
import {isNode, newLineFeedSplitter, ensureDoesntBlockExitting} from './util.mjs'
import {createNamedPipe} from './util.mjs'
import {parseIipcMessage, stringifyIipcMessage} from './iipc.mjs'


export var broker


if (isNode) {

	var {env} = process

	// Name of the pipe used by uwp-node for internal messages
	if (env['uwp-node-stdio-iipc']) {

		var pipeName = env['uwp-node-stdio-iipc']
		delete env['uwp-node-stdio-iipc']

		broker = createNamedPipe(pipeName, false)
		// Unrefs/Refs the channel whenever needed
		ensureDoesntBlockExitting(broker)
		// Handle incomming Internal-IPC messages, emit them as 'message' on broker.
		newLineFeedSplitter(broker, line => {
			broker.emit(...parseIipcMessage(line))
		})
		// Enable sending IIPC messages through broker.emitIipc()
		broker.emitIipc = (...args) => {
			return new Promise((resolve, reject) => {
				if (!broker.connected)
					reject(new Error(`not connected to uwp-node-broker`))
				broker.write(stringifyIipcMessage(...args) + '\n', resolve)
			})
		}

		// TODO: future idea: have 'ready' event on ChildProcess that fires once
		//       the process starts, has pid, and is connected to broker pipe (takes a few millis)
		//broker.on('connect', () => console.log('broker ready'))

	} else {

		// This code runs in Node.js process that was not spawned by UWP.
		// There is not broker to connect to but we'll return at leas a dummy EventEmitter
		// to prevent breaking user's code (during development).
		broker = new EventEmitter
		broker.emitIipc = () => {}

	}

}