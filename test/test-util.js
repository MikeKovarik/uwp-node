module.exports.NODE = process.execPath


module.exports.promiseEvent = function(emitter, name) {
	return new Promise(resolve => {
		emitter.once(name, resolve)
	})	
}

module.exports.promiseTimeout = (millis = 0) => {
	new Promise(resolve => setTimeout(resolve, millis))
}
