import {EventEmitter} from 'events'
import {rtComponent} from './uwp-util.mjs'

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
		this.killed = false
		var onMessage = valueSet => super.emit('message', valueSet)
		rtComponent.addEventListener('connection', conn => {
			connection = conn
			connection.addEventListener('requestreceived', onMessage)
			this.connected = true
			this.killed = false
			super.emit('connection', connection)
		})
		rtComponent.addEventListener('canceled', () => {
			connection.removeEventListener('requestreceived', onMessage)
			connection = undefined
			this.connected = false
			this.killed = true
			super.emit('close')
		})
	}

	async send(object) {
		if (!this.connected) return
		if (typeof object === 'string') {
			var valueSet = new ValueSet
			valueSet.insert('event', object)
		} else {
			var valueSet = objectToValueSet(object)
		}
		var result = await wrapUwpPromise(rtComponent.send(valueSet))
		console.log('result', result)
		// Reject the promise if response contains 'error' property (the call failed).
		if (result.error)
			throw new Error(result.error)
		return valueSetToObject(result)
	}

	emit(name, data) {
		super.emit(name, data)
		var valueSet = new ValueSet
		valueSet.insert('event', name)
		valueSet.insert('data', data)
	}

	async launch() {
		try {
			await FullTrustProcessLauncher.launchFullTrustProcessForCurrentAppAsync()
		} catch(err) {
			super.emit('error', err)
		}
	}

	kill() {
		this.emit('kill')
	}

	start() {return this.launch()}
	stop() {return this.kill()}

}

export var broker = new BrokerProcess
