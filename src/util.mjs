export var isUwp = typeof Winows !== 'undefined' && !!Windows.ApplicationModel
export var isNode = typeof process !== 'undefined' && !!process.versions && !!process.versions.node

export function handleStreamJson(channel, callback) {
	var jsonBuffer = ''
	var handler = chunk => {
		jsonBuffer += chunk.toString()
		if (jsonBuffer.includes('\n')) {
			let chunks = jsonBuffer.split('\n')
			jsonBuffer = chunks.pop()
			chunks.forEach(json => callback(JSON.parse(json)))
		}
	}
	channel.on('data', handler)
	return handler
}

export function setupChannel(target, channel) {
	target.channel = channel
	target.send = (object) => channel.write(JSON.stringify(object) + '\n')
	handleStreamJson(channel, object => target.emit('message', object))
}

export function createIpcChannel(target, fd, channel) {
	if (!channel)
		channel = new Duplex
	channel._read = () => {}
	channel.fd = fd
	setupChannel(target, channel)
	return channel
}




export var sendIpcMessage
export var rtComponent
export var rtComponentName = 'uwpNode'

if (isUwp) {
	rtComponent = window[rtComponentName]
}