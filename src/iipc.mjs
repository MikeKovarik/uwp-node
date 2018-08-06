export function parseIipcMessage(line) {
	return line.split(':')
}

export function stringifyIipcMessage(cmd, arg) {
	return arg === undefined ? cmd : `${cmd}:${arg}`
}
