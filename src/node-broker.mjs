import {EventEmitter} from 'events'
import {isNode, newLineFeedSplitter, setupChannel} from './util.mjs'
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

		newLineFeedSplitter(broker, line => {
			broker.emit('message', ...parseIipcMessage(line))
		})

		broker.send = (...args) => {
			return new Promise((resolve, reject) => {
				if (!broker.connected)
					reject(new Error(`not connected to uwp-node-broker`))
				broker.write(stringifyIipcMessage(...args), resolve)
			})
		}

	} else {

		// This code runs in Node.js process that was not spawned by UWP.
		// There is not broker to connect to but we'll return at leas a dummy EventEmitter
		// to prevent breaking user's code (during development).
		broker = new EventEmitter
		broker.send = () => {}

	}

}