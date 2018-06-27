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

class BrokerProcess extends EventEmitter {

	constructor() {
		this.connected = false
		var onMessage = valueSet => super.emit('message', valueSet)
		rtComponent.addEventListener('connection', conn => {
			connection = conn
			connection.addEventListener('requestreceived', onMessage)
			this.connected = true
			super.emit('connection', connection)
		})
		rtComponent.addEventListener('canceled', () => {
			connection.removeEventListener('requestreceived', onMessage)
			connection = undefined
			this.connected = false
			super.emit('close')
		})
	}

	async send(message) {
		if (!this.connected) {
				// todo, this should be handled by setupChannel()
			throw new Error(`Cannot connect to uwp-node-broker`)
		}
		if (typeof object === 'string') {
			// TODO: this 
			message = {}
		}
		var valueSet = objectToValueSet(message)
		var result = await wrapUwpPromise(rtComponent.send(valueSet))
		// Reject the promise if response contains 'error' property (the call failed).
		if (result.error)
			throw new Error(result.error)
		if (result)
			return valueSetToObject(result)
	}
	async _sendValueSet(message) {
	}

	write(buffer) {
		console.warn('uwp-node.broker is not a stream and .write() method should not be used.')
	}

	async launch() {
		try {
			await FullTrustProcessLauncher.launchFullTrustProcessForCurrentAppAsync()
		} catch(err) {
			super.emit('error', err)
		}
	}

	kill() {
		this.send('kill')
	}

	start() {return this.launch()}
	stop() {return this.kill()}

}

export var broker = new BrokerProcess
