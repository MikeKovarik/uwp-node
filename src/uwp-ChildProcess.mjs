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

var processes = []
function generateCid() {
	return Math.round(Math.random() * 100000)
}

export class ChildProcess extends EventEmitter {

	constructor(program, args = [], options = {}) {
		super()

		// Custom ID (not to be mistaked with PID = Process ID managed by system).
		// It is used to mark outgoing and incomming IPC messaging to/from broker process that takes care
		// of actually running the process. It's needed to be able to accept initial info and state (or error)
		// of the process before it launches and is assigned PID.
		var currentCids = processes.map(cp => cp.cid)
		this.cid = generateCid()
		while (currentCids.includes(this.cid)) this.cid = generateCid()
		// Keep track of running instances.
		processes.push(this)

		// Process is started in background broker
		if (!broker.connected)
			throw new Error(`child process ${program} could not be spawned because uwp-node-broker process is not running.`)

		// Each created stdio pipe/stream increments _closesNeeded counter.
		// Each time 'end' is emitted on stdio or 'exit' is emitted on process the _closesGot increments.
		// When these two are equal, 'close' event is emitted on process and it is then disposed.
		this._closesNeeded = 1
		this._closesGot = 0

		this.signalCode = null
		this.exitCode = null
		this.killed = false

		this._onMessage = this._onMessage.bind(this)
		this._destroy = this._destroy.bind(this)
		this._onSetupMessage = this._onSetupMessage.bind(this)
		this._maybeClose = this._maybeClose.bind(this)

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

		// Desotroy all pipes, resources, and listeners when the process closes or errors.
		// NOTE: C# broker should take care of disposing and releasing its resources, so there
		//       is no need to call kill() from here, once the process closes.
		this.once('close', this._destroy)
		this.once('error', this._destroy)

		// Launch the process.
		options.cid = this.cid
		broker.on('internalMessage', this._onSetupMessage)
		broker._internalSend(options)
	}

	_onSetupMessage(res) {
		//console.log('_onSetupMessage()', this.cid, res)
		if (res.cid === this.cid) {
			if (res.error) {
				this._handleError(res.error)
			} else if (res.pid !== undefined) {
				// Broker finally started the process and sent us this first message with PID.
				// There are more to come, they will be marked with CID (not PID).
				// Now we need to setup everything
				broker.removeListener('internalMessage', this._onSetupMessage)
				this.pid = res.pid
				// Attach stdio events listeners and pipes to the broker process.
				this._attachToBroker()
			}
		}
	}

	// Attaches current instance (now that we now PID of the remotely created process)
	// to the uwp-node broker process that notifies us about all of STDIO and custom pipes
	// though 'internalMessage' event.
	_attachToBroker() {
		//console.log('----------------------------------------------------------------')
		//console.log('_attachToBroker()', this.cid)
		//console.log('----------------------------------------------------------------')
		for (var pipe of this._pipes) {
			if (!(pipe instanceof Writable)) continue
			pipe._write = (chunk, encoding, cb) => {
				var req = {
					cid: this.cid,
					fd: pipe.fd,
					data: chunk,
				}
				broker._internalSend(req).then(cb)
			}
		}
		broker.on('internalMessage', this._onMessage)
	}

	_onMessage(res) {
		//console.log('_onMessage()', this.cid, JSON.stringify(res))
		// Only accept messages with matching Custom Id of this process.
		if (res.cid !== this.cid) return
		if (res.exitCode !== undefined) this._onExit(res.exitCode)
		if (res.fd !== undefined) {
			// Messages (and errors) can be further scoped down to specific stream (specified by its fd).
			var pipe = this._pipes[res.fd]
			if (!pipe.readable) return
			if (pipe._readableState.ended) return
			if (res.pid !== null) this.pid = res.pid
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
			if (res.error) this._handleError(res.error)
		}
	}

	_handleError(err) {
		console.log('_handleError()', err instanceof Error, err)
		setTimeout(() => this.emit('error', err))
	}

	// NOTE: killing the process with .kill() results in exitCode=null. It should not throw.
	async kill(signal) {
		// TODO: properly test if this actually kills the process in broker and release all resources
		//       (if its removed from the list of running processes).
		//       This may need internal uwp-node IPC system to work before it can be done.
		await broker._internalSend({
			cid: this.cid,
			kill: true,
		})
		this.killed = true
		// Make sure the instance gets destroyed in case connection to uwp-node is severed
		// before exit code could reach UWP and cause _destroy to be called.
		setTimeout(() => this._destroy(), 2000)
	}

	_destroy() {
		if (this._destroyed) return
		//console.log('################################################################')
		//console.log('_destroy', this.cid)
		//console.log('################################################################')
		broker.removeListener('internalMessage', this._onMessage)
		broker.removeListener('internalMessage', this._onSetupMessage)
		this.removeListener('close', this._destroy)
		this.removeListener('error', this._destroy)
		this._flushStdio()
		this._forceCloseStdio()
		// Destroy can be called after 'close' or 'error' event. In case of close we could destroy the stdio
		// immediately because each of the streams are already closed. That's not the case for 'error' event.
		// We need to wait out a while to make sure all the streams are flushed.
		setTimeout(() => this._destroyStdio(), 100)
		this.removeAllListeners()
		this._destroyed = true
	}

	_onExit(exitCode, signalCode) {
		//console.log('_onExit()', exitCode)
		if (signalCode)
			this.signalCode = signalCode
		this.exitCode = exitCode
		setTimeout(() => {
			// NOTE: killing the process with .kill() results in exitCode=null. It should not throw.
			if (exitCode !== null && exitCode < 0)
				this._handleError(new Error(`errnoException spawn ${exitCode}`))
			else
				this.emit('exit', this.exitCode, this.signalCode)
			this._maybeClose()
			this._flushStdio()
			// NOTE: Race between process and stdio disposal might leave some of the custom stdio pipes left unclosed.
			// Not really, but just the message of their closure might not have reached JS first before 'exit' event.
			// We need to close off all remaining pipes.
			this._forceCloseStdio()
		})
	}

	// Makes sure all stdio pipes are switched in flowing mode so they can emit 'end' event.
	// When pipes are not in flowing mode (no 'data' listener is attached), we would not be able
	// to close off the pipes. It's necessary for _maybeClose() and eventually firing 'close' event on the process itself.
	_flushStdio() {
		this._pipes
			.filter(stream => stream.readable && !stream._readableState.readableListening)
			.forEach(stream => stream.resume())
	}

	// Makes sure all stdio streams that remain un-ended will be ended by pushing null,
	// which will then trigger 'end' event in the stream.
	_forceCloseStdio() {
		this._pipes
			.filter(stream => stream.readable && !stream._readableState.ended)
			.forEach(stream => stream.push(null))
	}

	// Burtal absolute devastation!
	_destroyStdio() {
		this._pipes
			.filter(stream => stream !== null)
			.forEach(stream => {
				stream.destroy()
				stream.removeAllListeners()
			})
	}

	// This is only called as a response to 'end' events on stdio and 'exit' on the process itself.
	// When everything is ended and exited, the final 'close' event will be emitted on the process.
	_maybeClose() {
		this._closesGot++
		//console.log('_maybeClose', this._closesGot, this._closesNeeded)
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
			stream.once('close', this._maybeClose)
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

	//connected, disconnect() and send() are implemented by setupChannel()

}
