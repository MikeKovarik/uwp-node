import {EventEmitter} from 'events'
import {isNode, handleStreamJson, setupChannel} from './util.mjs'
import {createNamedPipe} from './util.mjs'


export var broker

if (isNode) {

	var {env} = process

	// Name of the pipe used by uwp-node for internal messages
	if (env['uwp-node-broker-pipe']) {

		var pipeName = env['uwp-node-broker-pipe']
		delete env['uwp-node-broker-pipe']

		try {
			broker = createNamedPipe(pipeName)
			// Creates .send() method that wraps every sent message into \n delimeted JSONs
			// and unwraps and parses incoming data and exposes it as 'message' event.
			setupChannel(broker, broker)
			// TODO: REWORK broker-to-node communication. It should be simple key:value pair
			// because we'd have to bundle JSON parser in the broker.
		} catch (err) {
			throw new Error('Could not connect to uwp-node-broker')
		}
/*
		handleStreamJson(broker, event => {
			switch (event) {
				//case 'kill':
				//	process.kill()
				//	break;
				default:
			}
			broker.emit(event)
		})

		broker.send = function(message) {
			if (!this.connected) {
				 // todo, this should be handled by setupChannel()
				throw new Error(`Cannot connect to uwp-node-broker`)
			}
			this.write(JSON.stringify(message) + '\n')
		}
*/
	} else {

		// This code runs in Node.js process that was not spawned by UWP.
		// There is not broker to connect to but we'll return at leas a dummy EventEmitter
		// to prevent breaking user's code (during development).
		broker = new EventEmitter
		broker.send = () => {}

	}

}