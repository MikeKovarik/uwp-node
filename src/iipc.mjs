export function parseIipcMessage(line) {
	return line.split(':')
}

export function stringifyIipcMessage(cmd, arg) {
	var message = arg === undefined ? cmd : `${cmd}:${arg}`
	return message + '\n'
}
