import {EventEmitter} from 'events'
import {Readable, Writable, Duplex} from 'stream'
import {createIpcChannel, sendIpcMessage} from './util.mjs'



const STDIN = 0
const STDOUT = 1
const STDERR = 2

//var streams = [process.stdin, process.stdout, process.stderr]

export class ChildProcess extends EventEmitter {

	constructor(program, args = [], options = {}) {
		super()

		this._closesNeeded = 1;
		this._closesGot = 0;
		this.connected = false;

		this.signalCode = null;
		this.exitCode = null;
		this.killed = false;
		this.spawnfile = null;

		var emitError = err => this.emit('error', err)

		this._prepareStdio(options.stdio || 'pipe')
		
		this.stdin  = this.stdio[0] || null
		this.stdout = this.stdio[1] || null
		this.stderr = this.stdio[2] || null

		this.stdin._write = (chunk, encoding, cb) => {
			// TODO: throw error if the process is dead
			var options = {
				pid: this.pid,
				stdin: chunk.toString()
			}
			sendIpcMessage(options)
				.then(() => cb()) // warning: no arg can be passed into cb
				.catch(emitError)
		}
		if (!options.cwd)
			options.cwd = Windows.ApplicationModel.Package.current.installedLocation.path
		// Extend options to be passed into runtime component but preserve user's options object.
		options = Object.assign({}, options)
		options.program = program
		options.args = args.join(' ')
		options.spawn = 'endless' //
		// Launch the process.
		sendIpcMessage(options)
			.then(response => {
				this.pid = response.pid
				this.connected = true
			})
			.catch(emitError)
		
		var onInternalMessage = vs => {
			if (vs.pid !== this.pid) return
			if (vs.processStdout) this.stdout.push(vs.stdout)
			if (vs.processStderr) this.stderr.push(vs.stderr)
			if (vs.processExited) this._onExit(parseInt(vs.exitCode))
		}
		var killback = () => {
			uwpNode.removeEventListener('message', onInternalMessage)
		}
		// TODO: handle the events and killback better.
		uwpNode.addEventListener('message', onInternalMessage)
		this.once('close', killback)
		this.once('error', killback)

	}

	// TODO
	kill(signal) {
		// signal is string like 'SIGHUP'
		// this.emit(code, signal)
		this.killed = true
	}

	// TODO
	disconnect() {
		this.connected = false
	}

	_onExit(exitCode, signalCode) {
		if (signalCode)
			this.signalCode = signalCode
		this.exitCode = exitCode
		if (this.stdin)
			this.stdin.destroy()
		this.emit('exit', this.exitCode, this.signalCode)
	}

	_maybeClose() {
		this._closesGot++
		if (this._closesGot === this._closesNeeded)
			this.emit('close', this.exitCode, this.signalCode)
	}

	_prepareStdio(stdio = 'pipe') {
		// Replace shortcut with an array
		if (typeof stdio === 'string') {
			switch (stdio) {
				case 'ignore':  stdio = ['ignore', 'ignore', 'ignore']; break
				case 'pipe':    stdio = ['pipe', 'pipe', 'pipe']; break
				case 'inherit': stdio = [0, 1, 2]; break
				default:
					throw new ERR_INVALID_OPT_VALUE('stdio', stdio)
			}
		} else if (!Array.isArray(stdio)) {
			throw new ERR_INVALID_OPT_VALUE('stdio', util.inspect(stdio))
		}

		// Fill stdio with defaults (three ignores) if none other
		while (stdio.length < 3)
			stdio.push('ignore')
		stdio = stdio.map((item, i) => {
			if (item === null || item === undefined)
				return i < 3 ? 'pipe' : 'ignore'
			if (item === 'inherit')
				return i
			return item
		})

		// Create streams for communication with the child process.
		// These are the one representing child's stdin, stdout, stderr and other custom pipes
		// that pierce the boundary of main processes and serve as sink/source for child.
		this._stdioStreams = stdio.map((item, i) => {
			if (item === 'ignore')
				return null
			if (i === STDIN)
				return new Writable
			if (i === STDOUT || i === STDERR)
				var stream = new Readable
			else
				var stream = new Duplex
			stream._read = () => {}
			stream.on('close', () => this._maybeClose(this))
			this._closesNeeded++
			if (item === 'ipc')
				stream.ipc = true
			return stream
		})
		// Copy internal streams array into Node's proc.stdio and replace 'ipc' with null if needed.
		this.stdio = this._stdioStreams.slice(0)
		if (stdio.includes('ipc')) {
			this._closesNeeded++
			createIpcChannel(this, stdio.indexOf('ipc'))
			// 'ipc' is integrated into the process object. The stream is not directly available.
			this.stdio[this.channel.fd] = null
		}
		// Array of user defined streams that are piped to/from child process' stdio streams.
		// i.e. numbers, 'inherit', custom streams
		var targets = stdio.map(item => {
			if (typeof item === 'number')
				return stream[item]
			if (item instanceof Readable || item instanceof Writable)
				return item
		})
		// Wire stdio and inherit-targets together by piping data between them.
		for (var i = 0; i < stdio.length; i++) {
			let stdioStream = stdio[i]
			let targetStream = targets[i]
			if (!stdioStream || !targetStream) continue
			if (stdioStream instanceof Readable && targetStream instanceof Writable)
				stdioStream.pipe(targetStream)
			if (targetStream instanceof Readable && stdioStream instanceof Writable)
				targetStream.pipe(stdioStream)
		}
	}

}
