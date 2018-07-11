import {EventEmitter} from 'events'
import {isUwp, isUwpMock} from './util.mjs'


export var connection
export var broker

var rtComponent
var rtComponentName = 'uwpNode'


if (isUwp || isUwpMock) {

	var {FullTrustProcessLauncher} = Windows.ApplicationModel
	var {ValueSet} = Windows.Foundation.Collections

	// Grab UWP Runtime Component from window object.
	if (typeof window !== 'undefined')
		rtComponent = window[rtComponentName]

	function objectToValueSet(object) {
		var valueSet = new ValueSet()
		for (var key in object)
			valueSet.insert(key, object[key])
		return valueSet
	}


	class BrokerProcess extends EventEmitter {

		constructor() {
			super()
			this.connected = false

			this._onCanceled = this._onCanceled.bind(this)
			this._onBackgroundActivated = this._onBackgroundActivated.bind(this)
			this._onRequestReceived = this._onRequestReceived.bind(this)

			// Newer API's since build 17692 allow listening on the BackgroundActivated event from JS.
			// Unfortunately it is unstable. If the background fulltrust process crashes or closes, it causes
			// "An unhandles win32 exception occurred in WWAHost.exe" error and crashes the whole app.
			var canUseNativeUwpJsApi = typeof Windows !== 'undefined'
				&& Windows.UI && Windows.UI.WebUI
				&& Windows.UI.WebUI.WebUIApplication
				&& 'onbackgroundactivated' in Windows.UI.WebUI.WebUIApplication
			var attached = false
			// NOTE: It could fail with "access denied"
			if (canUseNativeUwpJsApi)
				attached = this._attachEventSource(Windows.UI.WebUI.WebUIApplication)
			if (!attached && rtComponent)
				this._attachEventSource(rtComponent)
		}

		_attachEventSource(eventSource) {
			console.log('attaching event source')
			// Newer API's since build 17692 allow listening on the BackgroundActivated event from JS.
			// Unfortunately it is unstable. If the background fulltrust process crashes or closes, it causes
			// "An unhandles win32 exception occurred in WWAHost.exe" error and crashes the whole app.
			try {
				// NOTE: This very line can cause throwing UWP "Access Denied" error (if the code runs in WebView within C# shell)
				eventSource.addEventListener('backgroundactivated', this._onBackgroundActivated)
				return true
			} catch(err) {
				return false
			}
		}
		
		_onRequestReceived(e) {
			var valueSet = e.request.message
			//console.log('_onRequestReceived', valueSet)
			if (valueSet.error && !valueSet.cid) {
				if (this._events.error && this._events.error.length) {
					super.emit('error', valueSet.error) // TODO: maybe throw if there's no listener, like Node
				} else {
					var err = new Error('Uncaught uwp-node broker error')
					err.stack = valueSet.error
					throw err
				}
			} else if (valueSet.ipc) {
				super.emit('message', valueSet.ipc) // TODO: unwrap from JSON?
			} else {
				super.emit('internalMessage', valueSet)
			}
		}
		
		_onBackgroundActivated(e) {
			//console.log('--- backgroundactivated ---')
			this.taskInstance = e.taskInstance
			this.taskInstance.addEventListener('canceled', this._onCanceled)
			// Needed to keep the process running. Calling .complete() on the deferral will close the background process.
			this.deferral = this.taskInstance.getDeferral()
			this.connection = this.taskInstance.triggerDetails.appServiceConnection
			this.connection.addEventListener('requestreceived', this._onRequestReceived)
			this.connected = true
			super.emit('connection', this.connection)
			super.emit('ready')
		}
		
		_onCanceled() {
			if (this.taskInstance) {
				this.taskInstance.removeEventListener('canceled', this._onCanceled)
				this.taskInstance = undefined
			}
			this._completeDeferral()
			if (this.connection) {
				this.connection.removeEventListener('requestreceived', this._onRequestReceived)
				this.connection = undefined
			}
			this.connected = false
			super.emit('close')
		}

		// Completing deferral closes the background task if it is still running.
		_completeDeferral() {
			if (this.deferral) {
				this.deferral.complete()
				this.deferral = undefined
			}
		}

		_emitError(err) {
			super.emit('error', err)
		}

		async send(message) {
			if (!this.connected) {
					// todo, this should be handled by setupChannel()
				throw new Error(`Cannot connect to uwp-node-broker`)
			}
			return this._internalSend({
				ipc: JSON.stringify(message) + '\n'
			})
		}

		// Method used for internal communication between UWP and UWP Background Service (broker process)
		// through ValueSet class. It does few things.
		// - Returns promise after the roundtrip to the broker process and back with response.
		// - Resolves the response (converted from ValueSet to plain JS object).
		// - Or resolves with undefined if the response is empty
		// - Or throws if the response contains error ('error' field).
		async _internalSend(object) {
			//console.log('_internalSend', object)
			var req = objectToValueSet(object)
			try {
				await this.connection.sendMessageAsync(req)
			} catch(err) {
				this._emitError(err)
			}
		}

		async launch() {
			try {
				await FullTrustProcessLauncher.launchFullTrustProcessForCurrentAppAsync()
			} catch(err) {
				this._emitError(err)
			}
		}

		async kill() {
			// TODO: figure out internal IPC and make the message do something on the broker's side.
			await this.send('kill')
			// NOTE: this closes the broker process but does not care if any child is running under the broker.
			this._completeDeferral()
			this._onCanceled()
		}

		start() {return this.launch()}
		stop() {return this.kill()}

	}


	broker = new BrokerProcess

}
