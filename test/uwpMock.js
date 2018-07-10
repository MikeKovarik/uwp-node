var {EventEmitter} = require('events')
var cp = require('child_process')
var {testerExe} = require('./testerCompiler.js')
var {setupChannel, createNamedPipe} = require('../util.js')


// Helper functions
function awaitEvent(emitter, name) {
	return new Promise(resolve => {
		emitter.once(name, resolve)
	})	
}

// Instead of using STDOUT which might be polluted, the broker tester process only tells us
// name of the pipe we will use for IPC messaging.
var lineStart = 'CREATED IPC PIPE:'
function awaitPipeName(proc) {
	return new Promise((resolve, reject) => {
		proc.stdout.on('data', async buffer => {
			var str = buffer.toString().trim()
			if (str.startsWith(lineStart)) {
				var pipeName = str.split(':')[1].trim()
				resolve(pipeName)
			}
		})
	})
}

// UWP's promise .done(onOk, onErr) instead of .catch(onErr)
Promise.prototype.done = function(onResolve, onReject) {
	return this.then(onResolve).catch(onReject)
}


class ValueSet {
    insert(key, value) {
        this[key] = value
    }
}


class EventTarget extends EventEmitter {}
EventTarget.prototype.addEventListener = EventEmitter.prototype.on
EventTarget.prototype.removeEventListener = EventEmitter.prototype.removeListener


class AppServiceConnection extends EventTarget {

	constructor() {
		super()
		this._handleMessage = this._handleMessage.bind(this)
		this._ready = this._setup()
	}

	async _setup() {
		this.proc = cp.spawn(testerExe)
		this.proc.stdout.on('data', data => console.log(data.toString()))
		this.proc.stderr.on('data', data => console.error(data.toString()))
		this.proc.on('exit', code => console.warn('mock broker exitted:', code))
		this.proc.on('message', this._handleMessage)
		var pipeName = await awaitPipeName(this.proc)
		this.pipe = createNamedPipe(pipeName)
		setupChannel(this.proc, this.pipe)
		await awaitEvent(this.pipe, 'connect')
	}

	_handleMessage(message) {
		if ('mockReqId' in message) {
			this.emit('_response', message)
		} else {
			var e = {request: {message}}
			this.emit('requestreceived', e)
		}
	}

	sendMessageAsync(req) {
		return new Promise(resolve => {
			req.mockReqId = Math.floor(Math.random() * 100000)
			var responseFinder = message => {
				if (message.mockReqId === req.mockReqId) {
					this.removeListener('_response', responseFinder)
					delete message.mockReqId
					resolve({message})
				}
			}
			this.on('_response', responseFinder)
			this.proc.send(req)
		})
	}

}


class AppServiceTriggerDetails extends EventTarget {
	constructor() {
		super()
		this.appServiceConnection = new AppServiceConnection
	}
}


class BackgroundTaskInstance extends EventTarget {
	constructor() {
		super()
		this.triggerDetails = new AppServiceTriggerDetails
	}
	getDeferral() {
		return {
			complete() {}
		}
	}
}


class BackgroundActivatedEventArgs {
	constructor() {
		this.taskInstance = new BackgroundTaskInstance
	}
}


var WebUIApplication = new EventTarget
WebUIApplication.onbackgroundactivated = undefined


var Windows = global.Windows = {}

Windows.UI = {}
Windows.UI.WebUI = {}
Windows.UI.WebUI.WebUIApplication = WebUIApplication

Windows.Foundation = {}
Windows.Foundation.Collections = {}
Windows.Foundation.Collections.ValueSet = ValueSet

Windows.ApplicationModel = {}
Windows.ApplicationModel.FullTrustProcessLauncher = {}
Windows.ApplicationModel.FullTrustProcessLauncher.launchFullTrustProcessForCurrentAppAsync = () => {}


var args
module.exports = async function() {
	args = args || new BackgroundActivatedEventArgs
	await args.taskInstance.triggerDetails.appServiceConnection._ready
	Windows.UI.WebUI.WebUIApplication.emit('backgroundactivated', args)
}
