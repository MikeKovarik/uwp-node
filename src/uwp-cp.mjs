import {isUwp} from './util.mjs'
import {ChildProcess} from './uwp-ChildProcess.mjs'


export var spawn
export var exec
export var fork

if (isUwp) {

	// all of child's stdin, stdout and stderr are piped into main process' stdio
	//var stdio = ['inherit', 'inherit', 'inherit']
	//var stdio = [process.stdin, process.stdout, process.stderr]
	//var stdio = [0, 1, 2]
	//var stdio = [0, 'inherit', process.stderr]

	// child.stdin and child.stdout are created, child.stderr is piped into process.stderr
	//var stdio = ['pipe', 'pipe', process.stderr]
	//var stdio = ['pipe', 'pipe', 3]

	// custom stream for child.stdin, stdout and stderr are piped into main process' stdout and stderr
	// i.e. logs and errors from child are printed out in main process' console as well.
	//var stdio = ['pipe', 1, 2]
	//var stdio = ['pipe', 1, 2, 'ipc']




	// TODO. implement contents of normalizeSpawnArguments() from lib/child_process.js


	function stdioStringToArray(option) {
		switch (option) {
			case 'ignore':
			case 'pipe':
			case 'inherit':
				return [option, option, option, 'ipc'];
			default:
				throw new ERR_INVALID_OPT_VALUE('stdio', option);
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



	spawn = function(program, args = [], options = {}) {
		if (typeof args === 'object' && !Array.isArray(args)) {
			options = args
			args = []
		}
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