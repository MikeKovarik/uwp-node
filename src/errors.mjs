export class ERR_IPC_DISCONNECTED extends Error {
	constructor() {
		super('IPC channel is already disconnected')
		this.code = this.constructor.name
	}
}

export class ERR_IPC_CHANNEL_CLOSED extends Error {
	constructor() {
		super('Channel closed')
		this.code = this.constructor.name
	}
}

export class ERR_INVALID_OPT_VALUE extends Error {
	constructor(name, value) {
		super(`The value "${String(value)}" is invalid for option "${name}"`)
		this.code = this.constructor.name
	}
}

export class ERR_CHILD_PROCESS_IPC_REQUIRED extends TypeError {
	constructor(name) {
		super(`Forked processes must have an IPC channel, missing value 'ipc' in ${name}`)
		this.code = this.constructor.name
	}
}

export class ERR_INVALID_ARG_TYPE extends TypeError {
	constructor(name, expected, actual) {
		// determiner: 'must be' or 'must not be'
		if (typeof expected === 'string' && expected.startsWith('not ')) {
			var determiner = 'must not be'
			expected = expected.replace(/^not /, '')
		} else {
			var determiner = 'must be'
		}
		if (name.endsWith(' argument')) {
			// For cases like 'first argument'
			var msg = `The ${name} ${determiner} ${expected}`
		} else {
			var type = name.includes('.') ? 'property' : 'argument'
			var msg = `The "${name}" ${type} ${determiner} ${expected}`
		}
		msg += `. Received type ${typeof actual}`
		super(msg)
		this.code = this.constructor.name
	}
}

export class ERR_INVALID_ARG_VALUE extends TypeError {
	constructor(name, value, reason = 'is invalid') {
		super(`The argument '${name}' ${reason}. Received ${value}`)
		this.code = this.constructor.name
	}
}

export class ERR_MISSING_ARGS extends TypeError {
	constructor(...args) {
		args = args.map((a) => `"${a}"`)
		var msg = 'The '
		switch (args.length) {
			case 1:
				msg += `${args[0]} argument`
				break
			case 2:
				msg += `${args[0]} and ${args[1]} arguments`
				break
			default:
				msg += args.slice(0, args.length - 1).join(', ')
				msg += `, and ${args[args.length - 1]} arguments`
				break
		}
		super(`${msg} must be specified`)
		this.code = this.constructor.name
	}
}


// https://github.com/libuv/libuv/blob/1a0f61953019416b4888edeacde4209e05314c1c/include/uv/errno.h
var UV_CODES = {
	'-4092': 'EACCES',
	'-4088': 'EAGAIN',
	'-4066': 'EMFILE',
	'-4061': 'ENFILE',
	'-4058': 'ENOENT',
}

function getSystemErrorName(errorNumber) {
	return UV_CODES[errorNumber] || 'UNKNOWN'
}

// https://github.com/nodejs/node/blob/master/lib/internal/errors.js
export function errnoException(err, syscall, original) {
	// NOTE: err is a number and code is the name (e.g. err:-4058, code:ENOENT) 
	var code = getSystemErrorName(err)
	if (original)
		var message = `${syscall} ${code} ${original}`
	else
		var message = `${syscall} ${code}`
	var err = new Error(message)
	err.code = err.errno = code
	err.syscall = syscall
	return err
}