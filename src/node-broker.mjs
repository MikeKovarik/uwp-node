import {EventEmitter} from 'events'
import {isNode, setupChannel, handleStreamJson} from './util.mjs'
import {createNamedPipe} from './node-util.mjs'


export var broker
export var app

if (isNode) {

	var {env} = process

	// Name of the pipe used by uwp-node for internal messages
	if (env['uwp-node-broker-pipe']) {
		app = new EventEmitter
		//app.open = () => broker.
		//app.close = () => broker.

		var pipeName = env['uwp-node-broker-pipe']
		delete env['uwp-node-broker-pipe']
		try {
			broker = createNamedPipe(pipeName)
		} catch (err) {
			throw new Error('Could not connect to uwp-node-broker')
		}
		handleStreamJson(broker, event => {
			switch (event) {
				//case 'kill':
				//	process.kill()
				//	break;
				default:
			}
		})
	}

}