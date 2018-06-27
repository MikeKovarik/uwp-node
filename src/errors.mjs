export class ERR_IPC_DISCONNECTED extends Error {
	constructor() {
		super('IPC channel is already disconnected')
	}
}

export class ERR_IPC_CHANNEL_CLOSED extends Error {
	constructor() {
		super('Channel closed')
	}
}

export class ERR_INVALID_OPT_VALUE extends Error {
	constructor(name, value) {
		super(`The value "${String(value)}" is invalid for option "${name}"`)
	}
}

export class ERR_CHILD_PROCESS_IPC_REQUIRED extends TypeError {
	constructor(name) {
		super(`Forked processes must have an IPC channel, missing value 'ipc' in ${name}`)
	}
}