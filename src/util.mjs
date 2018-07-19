import fs from 'fs'
import {Socket} from 'net'
import {
	ERR_MISSING_ARGS,
	ERR_IPC_CHANNEL_CLOSED,
	ERR_IPC_DISCONNECTED
} from './errors.mjs'


export var isUwp = typeof Windows !== 'undefined' && typeof MSApp !== 'undefined'
export var isUwpMock = typeof Windows !== 'undefined' && typeof MSApp === 'undefined'
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

	Object.defineProperty(target, 'connected', {
		get: () => channel.connected,
		set: val => channel.connected = val,
	})

	target.channel = channel

	target.send = (message, callback) => {
		if (message === undefined)
			throw new ERR_MISSING_ARGS('message')
		if (channel.connected) {
			channel.write(JSON.stringify(message) + '\n', callback)
		} else {
			var err = new ERR_IPC_CHANNEL_CLOSED()
			if (callback)
				callback(err)
			else
				setTimeout(() => target.emit('error', err))
		}
	}

	target.disconnect = () => {
		if (!channel.connected) {
			target.emit('error', new ERR_IPC_DISCONNECTED())
			return
		}
		// Do not allow any new messages to be written.
		channel.connected = false
		console.warn('disconnect() not implemented') // TODO
	}

	channel.once('end', () => channel.connected = false)

	handleStreamJson(channel, message => target.emit('message', message))
}


// replica of Node's path.join()
export function joinPath(...segments) {
	var parts = []
	var newParts = []
	segments.forEach(seg => parts.push(...seg.replace(/\//g, '\\').split('\\')))
	parts
		.filter(part => part && part !== '.')
		.forEach(part => {
			if (part === '..')
				newParts.pop()
			else
				newParts.push(part)
		})
	return newParts.join('\\')
}

// NODE

export function createNamedPipe(name) {
	var path = `\\\\.\\pipe\\${name}`
	var channel = new Socket
	channel.connected = false
	var onError = err => {
		throw new Error(`uwp-node could not connect to pipe '${path}'`)
	}
	var onConnect = () => {
		channel.connected = true
		channel.removeListener('error', onError)
	}
	channel.on('error', onError)
	channel.connect(path, onConnect)
	// Create fake fd. Doesn't really do anything.
	var uselessFd = fs.openSync('\\\\.\\NUL', 'r')
	channel.once('close', hadError => {
		channel.connected = false
		fs.closeSync(uselessFd)
	})
	return channel
}

// Escaping strings for use as CMD arguments is madness.
// It's a world of smoke and mirrors.
// Nothing is true. Everything is permitted.
// No mortal can enter this loopyland without loosing his mind.
// Matthew 13:50 - ...There shall be wailing and gnashing of teeth.
// Fly you fools! Save yourself!
// Following code is taken from http://gfxmonk.net/2014/04/25/escaping-an-array-of-command-line-arguments-in-csharp.html
// to save the last remnants of my sanity.
function escapeCsharpArgument(arg) {
	var backslashes = 0
	var out = ''
	arg.split('').forEach(c => {
		if (c == '\\') {
			// Don't know if we need to double yet.
			backslashes++
		} else if (c == '"') {
			// Double backslashes.
			out += '\\'.repeat(backslashes * 2)
			backslashes = 0
			out += "\\\""
		} else {
			// Normal char
			if (backslashes > 0) {
				out += '\\'.repeat(backslashes)
				backslashes = 0
			}
			out += c
		}
	})
	// Add remaining backslashes, if any.
	if (backslashes > 0)
		out += '\\'.repeat(backslashes)
	out += '\\'.repeat(backslashes)
	return out
}

export function escapeCsharpArguments(args) {
	return args
		.map(escapeCsharpArgument)
		.map(arg => `"${arg}"`)
		.join(' ')
}