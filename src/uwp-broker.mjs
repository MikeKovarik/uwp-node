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
		super()
		this.connected = false
		// TODO: some more filtering between ipc and internal process messages
		var onMessage = e => {
			var valueSet = e.request.message
			console.log('onMessage', valueSet)
			if (valueSet.ipc)
				super.emit('message', valueSet.ipc) // TODO: unwrap from JSON?
			else
				super.emit('_internalMessage', valueSet)
		}
		//var onMessage = valueSet => super.emit('message', valueSet)
		rtComponent.addEventListener('connect', connection => {
			this.connection = connection
			this.connection.addEventListener('requestreceived', onMessage)
			this.connected = true
			super.emit('connection', this.connection)
		})
		rtComponent.addEventListener('canceled', () => {
			if (this.connection) {
				this.connection.removeEventListener('requestreceived', onMessage)
				this.connection = undefined
			}
			this.connected = false
			super.emit('close')
		})
	}

	async send(message) {
		if (!this.connected) {
				// todo, this should be handled by setupChannel()
			throw new Error(`Cannot connect to uwp-node-broker`)
		}
		return this._internalSend({
			ipc: JSON.stringify(message) + "\n"
		})
	}

	// Method used for internal communication between UWP and UWP Background Service (broker process)
	// through ValueSet class. It does few things.
	// - Returns promise after the roundtrip to the broker process and back with response.
	// - Resolves the response (converted from ValueSet to plain JS object).
	// - Or resolves with undefined if the response is empty
	// - Or throws if the response contains error ('error' field).
	async _internalSend(object) {
		var valueSet = objectToValueSet(object)
		console.log('_internalSend', object)
		var response = await wrapUwpPromise(this.connection.sendMessageAsync(valueSet))
		console.log('response', response)
		// Reject the promise if response.message contains 'error' property (the call failed).
		if (response.message.error)
			throw new Error(response.message.error)
		else if (response.message.size)
			return valueSetToObject(response.message)
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
