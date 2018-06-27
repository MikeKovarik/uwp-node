import {isUwp} from './util.mjs'
import {ChildProcess} from './uwp-ChildProcess.mjs'
import {ERR_INVALID_OPT_VALUE, ERR_CHILD_PROCESS_IPC_REQUIRED} from './errors.mjs'


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


	// WARNING: we're implementing only the promisified non-returning variant of exec().
	// exec() waits with its callback for the process to close and the function by default also
	// returns ChildProcess instance. But it's pretty much useless since we're only waiting for
	// complete stdout and stderr and we can't even define (create custom) pipes or use stdin.
	exec = async function(command, options = {}, callback) {
		if (typeof options === 'function') {
			callback = options
			options = {}
		}
		options.shell = options.shell || 'cmd.exe'
		options.startProcess = 'exec'

		return broker.send(options)
			.then(res => {
				var {stdout, stderr} = res
				return {stdout, stderr}
			})
			// TODO: might need to be changed if internal error handling changes
			//.catch(err => this.emit('error', err))
	}

	function awaitEvent(emitter, name) {
		return new Promise(resolve => emitter.once(name, resolve))
	}



}