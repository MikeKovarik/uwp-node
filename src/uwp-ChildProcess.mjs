import {EventEmitter} from 'events'
import {Readable, Writable, Duplex} from 'stream'
import {broker} from './uwp-broker.mjs'
import {setupChannel, escapeCsharpArguments} from './util.mjs'
import {
	ERR_INVALID_OPT_VALUE,
	ERR_INVALID_ARG_TYPE,
	errnoException
} from './errors.mjs'


const STDIN = 0
const STDOUT = 1
const STDERR = 2

// Before v8.0 streams did not have .destroy() method. Browser polyfill might be out of date and miss it too.
if (Readable.prototype.destroy === undefined)
	Readable.prototype.destroy = function() {}
if (Writable.prototype.destroy === undefined)
	Writable.prototype.destroy = function() {}

//var streams = [process.stdin, process.stdout, process.stderr]

// TODO: do we need to keep track of whole instances? rework to only list of CIDs.
var processes = []
function generateCid() {
	return Math.round(Math.random() * 100000)
}

export class ChildProcess extends EventEmitter {

	constructor() {
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
			throw new Error(`child process ${file} could not be spawned because uwp-node-broker process is not running.`)

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
		this._maybeClose = this._maybeClose.bind(this)

		// Desotroy all pipes, resources, and listeners when the process closes or errors.
		// NOTE: C# broker should take care of disposing and releasing its resources, so there
		//       is no need to call kill() from here, once the process closes.
		this.once('close', this._destroy)
		this.once('error', this._destroy)
	}

	// https://github.com/nodejs/node/blob/master/lib/internal/child_process.js
	// This method tries to follow Node.js' source code. Their code is a mess that could've been simpler
	// but we try to follow it as closely as possible to avoid unnecessary errors or unexpected functionality.
	spawn(options) {
		if (options === null || typeof options !== 'object') {
			throw new ERR_INVALID_ARG_TYPE('options', 'Object', options)
		}

		// We try to be as close to Node.js actual _validateStdio, but their's is a hot mess.
		// Our method returns array of types that we can stringify and pass to broker.
		// Then we added method _setupStdio() that creates the pipes and encapsulates
		// all the code that would be otherwise spilled all over spawn() as it is in Node's source.
		// instad of array of objects.
		options.stdio = this._validateStdio(options.stdio)

		if (typeof options.file !== 'string')
			throw new ERR_INVALID_ARG_TYPE('options.file', 'string', options.file)
		this.spawnfile = options.file

		if (Array.isArray(options.args))
			this.spawnargs = options.args
		else if (options.args === undefined)
			this.spawnargs = []
		//else
		//	throw new ERR_INVALID_ARG_TYPE('options.args', 'Array', options.args)

		options.cwd = options.cwd || process.cwd()
		// 'spawn' - long running with asynchronous evented STDIO.
		// 'exec'  - one time execution, blocking until process closes, reads STDOUT and STDERR at once.
		options.startProcess = options.startProcess || 'spawn'
		// Custom ID necessary for identification of messages or errors. Using PIDs is not possible due to timing.
		options.cid = this.cid

		// Node would wait with stdio setup until after possible error is thrown,
		// but we can only get async errors, so we always need to setup everything.
		this._setupStdio(options.stdio)
		// Launch and start receving messages from C# broker.
		this._attachToBroker()

		// Passing the important and custom fields to C#.
		// UWP ValueSet does not accept arrays, so we have to stringify it.
		options.stdio = options.stdio.join('|')

		if (Array.isArray(options.args))
			options.args = escapeCsharpArguments(options.args)

		broker._internalSend(options)
	}


	// Attaches current instance (now that we now PID of the remotely created process)
	// to the uwp-node broker process that notifies us about all of STDIO and custom pipes
	// though 'internalMessage' event.
	_attachToBroker() {
		//console.log('----------------------------------------------------------------')
		//console.log('_attachToBroker()', this.cid)
		//console.log('----------------------------------------------------------------')
		for (var pipe of this._stdioAll) {
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
		if (res.pid !== null) this.pid = res.pid
		if (res.exitCode !== undefined) this._onExit(res.exitCode)
		if (res.fd !== undefined) {
			// Messages (and errors) can be further scoped down to specific stream (specified by its fd).
			var pipe = this._stdioAll[res.fd]
			if (!pipe || !pipe.readable || pipe._readableState.ended) return
			// Underlying C# stream cand send null as the end of the stream. Pushing null to JS stream closes it.
			// Most of the incoming data comes in as Uint8Array buffer (cast from C# byte[]).
			// But we have to make it a Buffer ourselves (to make it use the U8A memory, instead of copying).
			// Also works when we receive string instead of bytes.
			pipe.push(res.data === null ? null : Buffer.from(res.data))
			// Emit error on the stream given by fd.
			if (res.error) pipe.emit('error', new Error(res.error))
		} else {
			// Emit bigass error on the process object. Something gone very wrong.
			if (res.error) this._emitError(res.error, res.stack)
		}
	}

	_emitError(message, stack) {
		if (message instanceof Error) {
			var err = message
		} else {
			var err = errnoException(null, 'spawn', message)
			err.stack = stack
		}
		// poor man's nextTick
		setTimeout(() => this.emit('error', err))
	}

	// NOTE: killing the process with .kill() results in exitCode=null. It should not throw.
	async kill(signal = null) {
		// TODO: properly test if this actually kills the process in broker and release all resources
		//       (if its removed from the list of running processes).
		//       This may need internal uwp-node IPC system to work before it can be done.
		try {
			await broker._internalSend({
				cid: this.cid,
				kill: signal,
			})
			this.killed = true
			// Make sure the instance gets destroyed in case connection to uwp-node is severed
			// before exit code could reach UWP and cause _destroy to be called.
			setTimeout(() => this._destroy(), 2000)
			return true
		} catch(err) {
			err = errnoException(null, 'kill', err)
			this._emitError(err)
			return false
		}
	}

	_destroy() {
		if (this._destroyed) return
		//console.log('################################################################')
		//console.log('_destroy', this.cid)
		//console.log('################################################################')
		broker.removeListener('internalMessage', this._onMessage)
		this.removeListener('close', this._destroy)
		this.removeListener('error', this._destroy)
		this._flushStdio()
		this._forceCloseStdio()
		// Destroy can be called after 'close' or 'error' event. In case of close we could destroy the stdio
		// immediately because each of the streams are already closed. That's not the case for 'error' event.
		// We need to wait out a while to make sure all the streams are flushed.
		// WARNING: If EventEmitter has no 'error' handlers, it throws the errors.
		// Removing all listeners immediately would result in a lot of uncaught exceptions.
		this._destroyed = true
		setTimeout(() => {
			this._destroyStdio()
			this.removeAllListeners()
		}, 100)
	}

	_onExit(exitCode, signalCode) {
		//console.log('_onExit()', exitCode)
		if (signalCode)
			this.signalCode = signalCode
		this.exitCode = exitCode
		setTimeout(() => {
			// NOTE: killing the process with .kill() results in exitCode=null. It should not throw.
			if (exitCode < 0) {
				var syscall = this.spawnfile ? 'spawn ' + this.spawnfile : 'spawn'
				var err = errnoException(exitCode, syscall)
				this._emitError(err)
			} else {
				this.emit('exit', this.exitCode, this.signalCode)
			}
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
		this._stdioAll
			.filter(stream => stream.readable && !stream._readableState.readableListening)
			.forEach(stream => stream.resume())
	}

	// Makes sure all stdio streams that remain un-ended will be ended by pushing null,
	// which will then trigger 'end' event in the stream.
	_forceCloseStdio() {
		this._stdioAll
			.filter(stream => stream.readable && !stream._readableState.ended)
			.forEach(stream => stream.push(null))
	}

	// Burtal absolute devastation!
	_destroyStdio() {
		this._stdioAll
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

	// https://github.com/nodejs/node/blob/master/lib/internal/child_process.js
	// This method tries to be as close to Node.js actual _validateStdio,
	// but that one is a hot mess. Our method returns array of types (ignore, null, pipe, etc..)
	// instad of array of objects.
	_validateStdio(stdio = 'pipe') {
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
		stdio = stdio.map((type, fd) => {
			if (type === null || type === undefined)
				return fd < 3 ? 'pipe' : 'ignore'
			if (type === 'inherit')
				return fd
			return type
		})

		return stdio
	}

	// stdio argument - array of type names ('ignore', 'pipe', 'inherit'), FDs, or null
	// this.stdio - array of streams or nulls accessible to the user. Excludes some streams even though they exist. e.g. IPC stream, usually fd 3
	// this._stdioAll - array of all streams (or nulls, only in case of 'ignore' or explicit null) used by the process and broker.
	_setupStdio(stdio) {
		// Create streams for communication with the child process.
		// These are the one representing child's stdin, stdout, stderr and other custom pipes
		// that pierce the boundary of main processes and serve as sink/source for child.
		this._stdioAll = stdio.map((type, fd) => {
			if (type === 'ignore')
				return null
			if (fd === STDIN)
				return new Writable
			if (fd === STDOUT || fd === STDERR)
				var stream = new Readable
			else
				var stream = new Duplex
			if (type === 'ipc') {
				stream.ipc = true
				stream.connected = true
			}
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

		// this._stdioAll represents all process' stream instances, including those usually hidden by IPC, ignore or FD.
		// this.stdio is list of streams accessible by user, some of which might be null (managed by Node)
		// for example IPC stream (usually fd 3) is null and inaccessible, because it's build into the child process object.
		// If FDs or 'ignore' instead of 'pipe' these pipes are also null in this.stdio.
		this.stdio = this._stdioAll.slice(0)

		// Iterate over stdio array (types, FDs, custom streams) and use it to hide unreachable streams
		// from this.stdio which only includes child's streams.
		stdio.forEach((type, fd) => {
			if (type === 'ignore' || typeof type === 'number') {
				// 'ignore'/null don't exist to begin with, numeric FDs signify routing which makes it unaccessible.
				this.stdio[fd] = null
			} else if (type === 'ipc') {
				// IPC channel is integrated into the process object. The stream is not directly available.
				this.stdio[fd] = null
				// Create Duplex stream on which messages will be received,
				var ipc = this._stdioAll[fd]
				// Attach Duplex IPC stream to this.channel, create send() and disconnect() methods,
				// handle and parse incomming data and re-emit it as 'message' events.
				// NOTE: setupChannel() assigns this.channel=ipc
				setupChannel(this, ipc)
			}
		})

		// Assign basic stdio to child process instance.
		this.stdin  = this.stdio[0] || null
		this.stdout = this.stdio[1] || null
		this.stderr = this.stdio[2] || null

		// Wire stdio and inherit-targets together by piping data between them.
		stdio
			// Array of user defined streams that are piped to/from child process' stdio streams.
			// i.e. FD numbers, custom streams
			.map(streamOrFd => {
				// User can specify FD numbers 0-2 signifying main process' stdin, stdout and stderr.
				// Node also handles more FDs beyond 2, but we don't have access to real FDs. So only 1-2 are supported.
				if (streamOrFd === STDIN)  return process.stdin
				if (streamOrFd === STDOUT) return process.stdout
				if (streamOrFd === STDERR) return process.stderr
				if (streamOrFd instanceof Readable || streamOrFd instanceof Writable)
					return streamOrFd
			})
			// Take the targets and pipe matching child's stdio into the targets.
			.map((target, fd) => {
				let source = this._stdioAll[fd]
				if (source === null || source === undefined || target === null || target === undefined)
					return
				if (source instanceof Readable && target instanceof Writable)
					source.pipe(target)
				else if (target instanceof Readable && source instanceof Writable)
					target.pipe(source)
			})

	}

	//connected, disconnect() and send() are implemented by setupChannel()

}
