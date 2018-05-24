import {isUwp} from './util.mjs'
import {ChildProcess} from './uwp-ChildProcess.mjs'
import {
	ERR_INVALID_OPT_VALUE,
	ERR_CHILD_PROCESS_IPC_REQUIRED
} from './uwp-util.mjs'


export var spawn
export var spawnAsAdmin
export var exec
export var execAsAdmin
export var fork
export var forkAsAdmin

if (isUwp) {

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
	// in https://github.com/nodejs/node/blob/master/lib/child_process.js
	function normalizeSpawnArguments(program, args = [], options = {}) {
		if (typeof args === 'object' && !Array.isArray(args)) {
			options = args
			args = []
		}
		return [program, args, options]
	}

	spawn = function(...spawnArgs) {
		var [program, args, options] = normalizeSpawnArguments(...spawnArgs)
		return new ChildProcess(program, args, options)
	}


	exec = async function(command, options = {}, callback) {
		if (typeof options === 'function') {
			callback = options
			options = {}
		}
		options.shell = options.shell || 'cmd.exe'
		try {
			var child = new ChildProcess(options.shell, command.split(' '), options)
			var stdout = ''
			var stderr = ''
			child.stdout.on('data', buffer => stdout += buffer)
			child.stderr.on('data', buffer => stderr += buffer)
			await awaitEvent(child, 'exit')
			if (callback)
				callback(null, stdout, stderr)
			else
				return {stdout, stderr}
		} catch(err) {
			if (callback)
				callback(err)
			else
				throw err
		}
	}


	function awaitEvent(emitter, name) {
		return new Promise(resolve => emitter.once(name, resolve))
	}



}