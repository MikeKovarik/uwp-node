import {EventEmitter} from 'events'
import {isUwp, isUwpMock} from './util.mjs'
import {parseIipcMessage, stringifyIipcMessage} from './iipc.mjs'


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
			// Completing deferral closes the background task if it is still running.
			if (this.deferral) {
				this.deferral.complete()
				this.deferral = undefined
			}
			if (this.connection) {
				this.connection.removeEventListener('requestreceived', this._onRequestReceived)
				//this.connection = undefined
			}
			this.connected = false
			super.emit('close')
		}

		_onRequestReceived(e) {
			//console.log('_onRequestReceived()', e.request.message)
			var valueSet = e.request.message
			if (valueSet.error && !valueSet.cid) {
				var err = new Error('uwp-node broker: ' + valueSet.error)
				err.stack = valueSet.stack
				if (this._events.error && this._events.error.length) {
					// TODO: take into account internal listeners
					super.emit('error', err)
				} else {
					throw err
				}
			} else if (valueSet.iipc) {
				super.emit(...parseIipcMessage(valueSet.iipc))
			} else {
				super.emit('message', valueSet)
			}
		}

		async emitIipc(...args) {
			await this.send({
				iipc: stringifyIipcMessage(...args)
			})
		}

		// Method used for internal communication between UWP and UWP Background Service (broker process)
		// through ValueSet class. It does few things.
		// - Returns promise after the roundtrip to the broker process and back with response.
		// - Resolves the response (converted from ValueSet to plain JS object).
		// - Or resolves with undefined if the response is empty
		// - Or throws if the response contains error ('error' field).
		async send(object) {
			//console.log('send', object)
			var req = objectToValueSet(object)
			try {
				await this.connection.sendMessageAsync(req)
			} catch(err) {
				this.emit('error', err)
			}
		}

		async launch() {
			try {
				await FullTrustProcessLauncher.launchFullTrustProcessForCurrentAppAsync()
			} catch(err) {
				this.emit('error', err)
			}
		}

		async kill() {
			// TODO: figure out internal IPC and make the message do something on the broker's side.
			await this.emitIipc('broker-kill')
			// NOTE: this closes the broker process but does not care if any child is running under the broker.
			this._onCanceled()
		}

		start() {return this.launch()}
		stop() {return this.kill()}

	}


	broker = new BrokerProcess

}
