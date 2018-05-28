
export var rtComponent
export var rtComponentName = 'uwpNode'

if (isUwp) {
	rtComponent = window[rtComponentName]
}


export class ERR_INVALID_OPT_VALUE extends Error {
	constructor(name, value) {
		var message = `The value "${String(value)}" is invalid for option "${name}"`
		super(message)
	}
}

export class ERR_CHILD_PROCESS_IPC_REQUIRED extends TypeError {
	constructor(name) {
		var message = `Forked processes must have an IPC channel, missing value 'ipc' in ${name}`
		super(message)
	}
}
