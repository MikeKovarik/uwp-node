import {EventEmitter} from 'events'
import {rtComponent} from './util.mjs'

var {FullTrustProcessLauncher} = Windows.ApplicationModel
var {ValueSet} = Windows.Foundation.Collections


function wrapUwpPromise(iAsyncOperation) {
	return new Promise((resolve, reject) => iAsyncOperation.done(resolve, reject))
}

function objectToValueSet(object) {
	var valueSet = new ValueSet()
	for (var key in object)
		valueSet.insert(key, object[key])
	return valueSet
}
function valueSetToObject(valueSet) {
	var object = {}
	for (var key of Object.getOwnPropertyNames(valueSet))
		object[key] = valueSet[key]
	return object
}

export var connection

class NodeUwpIpc extends EventEmitter {

	constructor() {
		var onMessage = valueSet => {
			this.emit('message', valueSet)
		}
		rtComponent.addEventListener('connection', conn => {
			connection = conn
			connection.addEventListener('requestreceived', onMessage)
			this.connected = true
			this.emit('connection', connection)
		})
		rtComponent.addEventListener('canceled', () => {
			connection.removeEventListener('requestreceived', onMessage)
			connection = undefined
			this.connected = false
			this.emit('close')
		})
	}

	async send() {
		var valueSet = objectToValueSet(object)
		var result = await wrapUwpPromise(rtComponent.send(valueSet))
		console.log('result', result)
		var object = valueSetToObject(result)
		if (object.error)
			throw new Error(object.error)
		return object
	}

	async launch() {
		try {
			await FullTrustProcessLauncher.launchFullTrustProcessForCurrentAppAsync()
		} catch(err) {
			this.emit('error', err.toString())
		}
	}

	kill() {
	}

	reattach() {
		// TODO: can this be even done?
	}

	start() {return this.launch()}
	stop() {return this.kill()}

}

export var nodeUwpIpc = new NodeUwpIpc
