import {isUwp, isUwpMock} from './util.mjs'
import {ChildProcess} from './uwp-ChildProcess.mjs'
import {
	ERR_INVALID_OPT_VALUE,
	ERR_CHILD_PROCESS_IPC_REQUIRED,
	ERR_INVALID_ARG_TYPE,
	ERR_INVALID_ARG_VALUE
} from './errors.mjs'


export var spawn
export var spawnAsAdmin
export var exec
export var execAsAdmin
export var fork
export var forkAsAdmin


if (isUwp || isUwpMock) {


	function stdioStringToArray(option) {
		switch (option) {
			case 'ignore':
			case 'pipe':
			case 'inherit':
				return [option, option, option, 'ipc']
			default:
				throw new ERR_INVALID_OPT_VALUE('stdio', option)
		}
	}

	fork = async function(program, args = [], options = {}) {
		if (typeof args === 'object' && !Array.isArray(args)) {
			options = args
			args = []
		}
		// Use a separate fd=3 for the IPC channel. Inherit stdin, stdout,
		// and stderr from the parent if silent isn't set.
		if (typeof options.stdio === 'string')
			options.stdio = stdioStringToArray(options.stdio)
		else if (!Array.isArray(options.stdio))
			options.stdio = stdioStringToArray(options.silent ? 'pipe' : 'inherit')
		else if (options.stdio.indexOf('ipc') === -1)
			throw new ERR_CHILD_PROCESS_IPC_REQUIRED('options.stdio')

		options.execPath = options.execPath || process.execPath
		options.shell = false

		return spawn(options.execPath, args, options)
	}


	// NOTE: this does not implement the insanely complex checks that node does
	// NOTE: only certain options fields are available.
	// in https://github.com/nodejs/node/blob/master/lib/child_process.js
	function normalizeSpawnArguments(file, args = [], options = {}) {
		if (typeof file !== 'string')
			throw new ERR_INVALID_ARG_TYPE('file', 'string', file)

		if (file.length === 0)
			throw new ERR_INVALID_ARG_VALUE('file', file, 'cannot be empty')

		if (Array.isArray(args)) {
			args = args.slice(0)
		} else if (args !== undefined && (args === null || typeof args !== 'object')) {
			throw new ERR_INVALID_ARG_TYPE('args', 'object', args)
		} else {
			options = args
			args = []
		}

		if (options === undefined)
			options = {}
		else if (options === null || typeof options !== 'object')
			throw new ERR_INVALID_ARG_TYPE('options', 'object', options)

		// Validate the cwd, if present.
		if (options.cwd != null && typeof options.cwd !== 'string')
			throw new ERR_INVALID_ARG_TYPE('options.cwd', 'string', options.cwd)

		// Validate the shell, if present.
		if (options.shell != null && typeof options.shell !== 'boolean' && typeof options.shell !== 'string')
			throw new ERR_INVALID_ARG_TYPE('options.shell', ['boolean', 'string'], options.shell)

		// Make a shallow copy so we don't clobber the user's options object.
		options = Object.assign({}, options)

		if (typeof args === 'object' && !Array.isArray(args)) {
			options = args
			args = []
		}
		return {file, args, options}
	}

	spawn = function(...spawnArgs) {
		var {file, args, options} = normalizeSpawnArguments(...spawnArgs)
		options.startProcess = 'spawn'
		options.file = file
		options.args = args
		var child = new ChildProcess()
		child.spawn(options)
		return child
	}



	function normalizeExecArgs(command, options = {}, callback) {
		if (typeof options === 'function') {
			callback = options
			options = undefined
		}
		// Make a shallow copy so we don't clobber the user's options object.
		options = Object.assign({}, options)
		//options.shell = typeof options.shell === 'string' ? options.shell : true
		// TODO: parse command into file and args
		options.file = command
		options.args = []
		return {command, options, callback}
	}

	exec = function(...execArgs) {
		var {command, options, callback} = normalizeExecArgs(...execArgs)
		options.startProcess = 'exec'
		options.shell = options.shell || 'cmd.exe'
		var child = new ChildProcess()
		child.spawn(options)
		var promise = new Promise((resolve, reject) => {
			var stdout = ''
			var stderr = ''
			child.stdout.on('data', buffer => stdout += buffer)
			child.stderr.on('data', buffer => stderr += buffer)
			child.stderr.once('error', reject)
			child.stderr.once('exit', code => {
				if (code < 0)
					reject()
				else
					resolve({stdout, stderr})
			})
		})
		if (callback) {
			promise
				.then(res => callback(null, res.stdout, res.stderr))
				.catch(err => callback(err))
		} else {
			return promise
		}
	}


}