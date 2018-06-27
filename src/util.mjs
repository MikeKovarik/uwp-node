import fs from 'fs'
import {Socket} from 'net'
import {ERR_IPC_CHANNEL_CLOSED, ERR_IPC_DISCONNECTED} from './errors.mjs'


export var isUwp = typeof Windows !== 'undefined' && typeof MSApp !== 'undefined'
export var isNode = typeof process !== 'undefined' && !!process.versions && !!process.versions.node

export function handleStreamJson(channel, callback) {
	var jsonBuffer = ''
	var handler = chunk => {
		jsonBuffer += chunk.toString()
		if (jsonBuffer.includes('\n')) {
			let chunks = jsonBuffer.split('\n')
			jsonBuffer = chunks.pop()
			chunks.forEach(json => callback(JSON.parse(json))) // TODO? let consumer parse it. it'd enable parsing even non-json newline delimited messages (broker ipc)
		}
	}
	channel.on('data', handler)
	return handler
}

// Creates .send() method on target that wraps every sent message into \n delimeted JSONs
// and unwraps and parses incoming data (from channel) and exposes it as 'message' event.
export function setupChannel(target, channel) {
	if (target.connected === undefined)
		target.connected = false
	target.channel = channel
	target.send = object => {
		if (target.connected)
			channel.write(JSON.stringify(object) + '\n')
		else
			target.emit('error', new ERR_IPC_CHANNEL_CLOSED())
	}
	target.disconnect = () => {
		if (!target.connected)
			return target.emit('error', new ERR_IPC_DISCONNECTED())
		// Do not allow any new messages to be written.
		target.connected = false
		console.warn('disconnect() not implemented') // TODO
	}
	handleStreamJson(channel, object => target.emit('message', object))
}


// NODE

export function createNamedPipe(name) {
	var fullName = getFullPipeName(name)
	var channel = new Socket
	target.connected = false
	var onError = err => {
		throw new Error(`uwp-node could not connect to pipe '${name}'`)
	}
	var onConnect = () => {
		target.connected = true
		channel.removeListener('error', onError)
	}
	channel.on('error', onError)
	channel.connect(fullName, onConnect)
	// Create fake fd. Doesn't really do anything.
	var uselessFd = fs.openSync('\\\\.\\NUL')
	channel.once('close', hadError => {
		target.connected = false
		fs.closeSync(uselessFd)
	})
	return channel
}

export function getFullPipeName(name) {
	return `\\\\.\\pipe\\uwp-node\\${name}`
}


// UWP

export var rtComponent
export var rtComponentName = 'uwpNode'

if (isUwp) {
	rtComponent = window[rtComponentName]
}
