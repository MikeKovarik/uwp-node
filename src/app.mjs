import {EventEmitter} from 'events'
import {isUwp} from './util.mjs'


export default function createApp(broker) {

	class NodeUwpApp extends EventEmitter {

		constructor() {
			broker.on('opened', () => this.emitLocal('opened'))
			broker.on('closed', () => this.emitLocal('closed'))
			broker.on('open', () => this.emitLocal('open'))
			broker.on('close', () => this.emitLocal('close'))
			this.pluginConstructor()
		}

		// Opens the app's window
		open(url = this.url) {
			this.emit('open', url) // TODO: make it pass data
		}

		// Closes the app's window
		close() {
			this.emit('close')
		}

		// Destroys the app, broker process and all processes managed by it
		// (including this) Node.js process.
		quit() {
			this.emit('quit')
		}

		emit(event, ...args) {
			this.emitLocal(event, ...args)
			broker.emit(event, ...args)
		}

	}

	NodeUwpApp.prototype.emitLocal = EventEmitter.prototype.emit


	// Wraps uwp-node as a plugin for iso-app module.
	class NodeUwpAppIsoAppPlugin extends NodeUwpApp {

		pluginConstructor() {
			if (this._registerNodeEndpoint)
				this._registerNodeEndpoint(broker)
			else
				console.warn('could not plug uwp-node into iso-app because ipc plugin is missing.')
		}

		launchUwpNodeBroker() {
			if (isUwp)
				broker.launch()
		}

	}


	// Register as iso-app plugin.
	var key = `__iso-app-internals__`
	var internals = global[key] = global[key] || {}

	if (internals.registerPlugin) {
		internals.registerPlugin(NodeUwpAppIsoAppPlugin)
	} else {
		var plugins = internals.plugins = internals.plugins || []
		plugins.push(NodeUwpAppIsoAppPlugin)
	}

	// Return app instance, either the iso-app or custom instance.
	if (internals.app) {
		return internals.app
	} else {
		return new NodeUwpAppIsoAppPlugin
	}

}