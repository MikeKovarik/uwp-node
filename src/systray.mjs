import {EventEmitter} from 'events'
import {nodeUwpIpc} from './stdio.mjs'


export var systray = new EventEmitter

nodeUwpIpc.on('message', e => {
	console.log('requestreceived', e)
})
