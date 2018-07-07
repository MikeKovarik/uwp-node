import {EventEmitter} from 'events'
import {Readable, Writable, Duplex} from 'stream'
import {broker} from './uwp-broker.mjs'
import {setupChannel} from './util.mjs'
import {ERR_INVALID_OPT_VALUE} from './errors.mjs'


const STDIN = 0
const STDOUT = 1
const STDERR = 2

// Before v8.0 streams did not have .destroy() method. Browser polyfill might be out of date and miss it too.
if (Readable.prototype.destroy === undefined)
	Readable.prototype.destroy = function() {}
if (Writable.prototype.destroy === undefined)
	Writable.prototype.destroy = function() {}

//var streams = [process.stdin, process.stdout, process.stderr]

export class ChildProcess extends EventEmitter {

	constructor(program, args = [], options = {}) {
		super()

		if (!broker.connected)
			throw new Error(`child process ${program} could not be spawned because uwp-node-broker process is not running.`)

		this._closesNeeded = 1
		this._closesGot = 0

		this.signalCode = null
		this.exitCode = null
		this.killed = false

		this._onMessage = this._onMessage.bind(this)

		options.stdio = this._sanitizeStdio(options.stdio)
		this._prepareStdio(options.stdio)
		// UWP ValueSet does not accept arrays, so we have to stringify it.
		options.stdio = options.stdio.join('|')
		
		this.stdin  = this.stdio[0] || null
		this.stdout = this.stdio[1] || null
		this.stderr = this.stdio[2] || null

		// Extend options to be passed into runtime component but preserve user's options object.
		options = Object.assign({}, options)
		options.program = program
		options.args = args.join(' ')
		options.cwd = options.cwd || process.cwd()
		// 'spawn' - long running with asynchronous evented STDIO.
		// 'exec'  - one time execution, blocking until process closes, reads STDOUT and STDERR at once.
		options.startProcess = options.startProcess || 'spawn'

		// Launch the process.
		broker._internalSend(options)
			.then(response => {
				if (!response)
					throw new Error('uwp-node: broker process response is empty')
				this.pid = response.pid
				// Attach stdio events listeners and pipes to the broker process.
				this._attachToBroker()
			})
			.catch(err => this.emit('error', err))
	}

	// WARNING: Node's exec() creates instance of the ChildProcess class but that's unnecesary and expensive.
	// We only implement the barebone functionality of running the process and returning stdout/stderr in callback/promise.
	static _exec(options) {
		options.startProcess = 'exec'
		return broker._internalSend(options)
	}

	// TODO
	kill(signal) {
		// signal is string like 'SIGHUP'
		// this.emit(code, signal)
		this.killed = true
		// TODO:
		this._pipes.forEach(stream => {
			if (stream != null) {
				stream.destroy()
				stream.removeAllListeners()
			}
		})
		broker.removeListener('_internalMessage', this._onMessage)
		this.removeAllListeners()
	}

	_onExit(exitCode, signalCode) {
		if (signalCode)
			this.signalCode = signalCode
		this.exitCode = exitCode
		if (this.stdin)
			this.stdin.destroy()
		setTimeout(() => {
			if (exitCode < 0) {
				//var err = errnoException(exitCode, 'spawn') // TODO
				var err = new Error(`Couldnt spawn, exitcode: ${exitCode}`) // TODO
				this.emit('error', err)
			} else {
				this.emit('exit', this.exitCode, this.signalCode)
			}
			this._maybeClose()
		})
		// NOTE: Race between process and stdio disposal might leave some of the custom stdio pipes left unclosed.
		// Not really, but just the message of their closure might not have reached JS first before 'exit' event.
		// We need to close off all remaining pipes.
		this._pipes.forEach(stream => {
			// TODO: detect if the stream is closed and close it if not.
			if (false)
				stream.push(null)
		})
	}

	_maybeClose() {
		this._closesGot++
		console.log('_maybeClose', this._closesGot, this._closesNeeded)
		if (this._closesGot === this._closesNeeded)
			this.emit('close', this.exitCode, this.signalCode)
	}

	_sanitizeStdio(stdio = 'pipe') {
		// Transform shortcut form into an array.
		if (typeof stdio === 'string') {
			switch (stdio) {
				case 'ignore':  stdio = ['ignore', 'ignore', 'ignore']; break
				case 'pipe':    stdio = ['pipe', 'pipe', 'pipe']; break
				case 'inherit': stdio = [0, 1, 2]; break
				default:
					throw new ERR_INVALID_OPT_VALUE('stdio', stdio)
			}
		} else if (!Array.isArray(stdio)) {
			throw new ERR_INVALID_OPT_VALUE('stdio', stdio)
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

		return stdio
	}

	_prepareStdio(stdio) {
		// Create streams for communication with the child process.
		// These are the one representing child's stdin, stdout, stderr and other custom pipes
		// that pierce the boundary of main processes and serve as sink/source for child.
		this._pipes = stdio.map((item, fd) => {
			if (item === 'ignore')
				return null
			if (fd === STDIN)
				return new Writable
			if (fd === STDOUT || fd === STDERR)
				var stream = new Readable
			else
				var stream = new Duplex
			if (item === 'ipc')
				stream.ipc = true
			// Reading can't be forced
			stream._read = () => {}
			// Process only emits 'close' when all stdio (readable or duplex) pipes are closed.
			this._closesNeeded++
			stream.fd = fd
			// Broker is only capable of ending the stream (pushing null results in 'end' event)
			// but we have to take care of emitting 'close' on each stream ourselves.
			stream.once('end', () => setTimeout(() => stream.emit('close')))
			stream.once('close', () => this._maybeClose(this))
			return stream
		})

		// Copy internal streams array into Node's proc.stdio and replace 'ipc' with null if needed.
		this.stdio = this._pipes.slice(0)
		if (stdio.includes('ipc')) {
			//this._closesNeeded++
			let fd = stdio.indexOf('ipc')
			// Create Duplex stream on which messages will be received,
			this.channel = this.stdio[fd]
			// Attach Duplex IPC stream to this.channel, create send() and disconnect() methods,
			// handle and parse incomming data and re-emit it as 'message' events.
			setupChannel(this, this.channel)
			// IPC channel is integrated into the process object. The stream is not directly available.
			this.stdio[fd] = null
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

	// Attaches current instance (now that we now PID of the remotely created process)
	// to the uwp-node broker process that notifies us about all of STDIO and custom pipes
	// though '_internalMessage' event.
	_attachToBroker() {
		for (var pipe of this._pipes) {
			if (!(pipe instanceof Writable)) continue
			pipe._write = (chunk, encoding, cb) => {
				var options = {
					pid: this.pid,
					fd: pipe.fd,
					data: chunk,
				}
				broker._internalSend(options)
					.then(() => cb()) // warning: no arg can be passed into cb
					.catch(err => pipe.emit('error', err))
			}
		}
		var killback = () => {
			broker.removeListener('message', this._onMessage)
			setTimeout(() => this.removeAllListeners(), 100)
		}
		// TODO: handle the events and killback better.
		broker.on('_internalMessage', this._onMessage)
		this.once('close', killback)
		this.once('error', killback)
	}

	_onMessage(res) {
		// Only accept messages with PID of this process.
		if (res.pid !== this.pid) return
		if (res.exitCode) this._onExit(res.exitCode)
		if (res.fd !== undefined) {
			// Messages (and errors) can be further scoped down to specific stream (specified by its fd).
			var pipe = this._pipes[res.fd]
			if (res.data === null) {
				// Underlying C# stream ended and sent null. Now we need to close the JS stream.
				pipe.push(null)
			} else if (res.data !== undefined) {
				// Most of the incoming data comes in as Uint8Array buffer (cast from C# byte[]).
				// But we have to make it a Buffer ourselves (to make it use the U8A memory, instead of copying).
				// Also works when we receive string instead of bytes.
				pipe.push(Buffer.from(res.data))
			}
			// Emit error on the stream given by fd.
			if (res.error) pipe.emit('error', res.error)
		} else {
			// Emit bigass error on the process object. Something gone very wrong.
			if (res.error) this.emit('error', res.error)
		}
	}

	//connected, disconnect() and send() are implemented by setupChannel()

}
