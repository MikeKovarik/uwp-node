import {Readable, Writable} from 'stream'
import {isUwp, joinPath} from './util.mjs'


// Shim of Node style process object.
if (isUwp) {

	// shim process
	if (typeof process === 'undefined')
		process = {env: {}}

	// Use cmd by default, like Node.
	process.env.ComSpec = process.env.ComSpec || 'cmd.exe'

	// https://nodejs.org/api/process.html#process_process_execpath
	// The process.execPath property returns the absolute pathname of the executable that started the Node.js process.
	// User is expected to include whole node installation within node folder of this app.
	// Default expected path of the node file is myapp/node/node.exe.
	var appPackage = Windows.ApplicationModel.Package.current
	if (!process.execPath)
		process.execPath = joinPath(appPackage.installedLocation.path, 'node\\node.exe')

	// shim stdin (no effect)
	if (!process.stdin) {
		process.stdin = new Readable
		process.stdin._read = () => {}
	}
	// shim stdout
	if (!process.stdout) {
		process.stdout = new Writable
		process.stdout._write = (chunk, encoding, cb) => cb(console.log(chunk.toString()))
	}
	// shim stderr
	if (!process.stderr) {
		process.stderr = new Writable
		process.stderr._write = (chunk, encoding, cb) => cb(console.error(chunk.toString()))
	}

}