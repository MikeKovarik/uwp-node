var {assert} = require('chai')
// hacky, but works, these are either node's child_process or uwp-node mocks.
var {spawn, exec} = global
var {NODE, promiseEvent, promiseTimeout} = require('./test-util.js')


// TODO: MORE TESTS:
//       - exitcode tests, file that throws, self closing file, etc...

var scriptEnv = './fixtures/child-env.js'
var scriptSimple = './fixtures/simple.js'
var scriptDelayed = './fixtures/simple-delayed.js'
var scriptEndless = './fixtures/simple-endless.js'
var scriptIpcBasic = './fixtures/child-ipc-basic.js'
var scriptIpcListener = './fixtures/child-ipc-listener.js'
var scriptIpcComplex = './fixtures/child-ipc-complex.js'

describe('spawn', function() {


	describe('basic scenarios', function() {


		it(`process.env is not polluted`, async () => {
			var stdio = 'pipe'
			var child = spawn(NODE, [scriptEnv], {stdio})
			var json = ''
			child.stdout.on('data', buffer => json += buffer)
			await promiseEvent(child, 'exit')
			var env = JSON.parse(json)
			var found = Object.keys(env).find(key => key.startsWith('uwp-node'))
			assert.isUndefined(found, 'env should not conain uwp-node-* keys')
		})

		it(`process closes if it doesnt have IPC`, async () => {
			var stdio = 'pipe'
			var child = spawn(NODE, [scriptSimple], {stdio})
			await promiseEvent(child, 'exit')
			await promiseEvent(child, 'close')
		})

		it(`process closes if it has IPC but no 'message' listener`, async () => {
			var stdio = ['pipe', 'pipe', 'pipe', 'ipc']
			var child = spawn(NODE, [scriptIpcBasic], {stdio})
			assert.isNull(child.exitCode)
			await promiseEvent(child, 'exit')
			await promiseEvent(child, 'close')
			assert.isNotNull(child.exitCode, 'exitCode should not be null anymore')
		})

		it(`killing process emits 'exit' event`, async () => {
			var child = spawn(NODE, [scriptEndless])
			setTimeout(() => child.kill())
			await Promise.all([
				promiseEvent(child, 'exit'),
				promiseEvent(child, 'close'),
			])
		})

		it(`killing process result in exitCode = null`, async () => {
			var child = spawn(NODE, [scriptEndless])
			setTimeout(() => child.kill())
			var exitCode = await promiseEvent(child, 'exit')
			assert.isNull(exitCode, 'exitCode emitted in exit should be null')
			assert.isNull(child.exitCode, 'child.exitCode should be null')
		})

		it(`all stdio emits 'close' without listeners`, async () => {
			var stdio = ['pipe', 'pipe', 'pipe']
			var child = spawn(NODE, [scriptEndless], {stdio})
			setTimeout(() => child.kill())
			await Promise.all([
				promiseEvent(child.stdout, 'close'),
				promiseEvent(child.stderr, 'close'),
			])
		})

		it(`all stdio emits 'close' with listeners`, async () => {
			var stdio = ['pipe', 'pipe', 'pipe']
			var child = spawn(NODE, [scriptEndless], {stdio})
			child.stdout.on('data', () => {})
			child.stderr.on('data', () => {})
			setTimeout(() => child.kill())
			await Promise.all([
				promiseEvent(child.stdout, 'close'),
				promiseEvent(child.stderr, 'close'),
			])
		})

		it(`process does not close if it has IPC and 'message' listener`, async () => {
			var stdio = ['pipe', 'pipe', 'pipe', 'ipc']
			var child = spawn(NODE, [scriptIpcListener], {stdio})
			assert.isNull(child.exitCode)
			var closed = false
			child.once('close', () => closed = true)
			await promiseTimeout(200)
			assert.isFalse(closed, `should not have emitted 'close'`)
			assert.isNull(child.exitCode, 'exitCode should be still null')
			await child.kill()
		})

		it(`process does not close if it has IPC and 'message' listener`, async () => {
			var stdio = ['pipe', 'pipe', 'pipe', 'ipc']
			var child = spawn(NODE, [scriptEndless], {stdio})
			var closed = false
			child.once('close', () => closed = true)
			await promiseTimeout(200)
			assert.isFalse(closed, `should not have emitted 'close'`)
			await child.kill()
			assert.isFalse(closed, `should not have emitted 'close'`)
			await promiseTimeout(200)
			assert.isTrue(closed, `should have emitted 'close' already`)
		})

	})


	describe(`routine for stdio variations`, function() {

		describe(`stdio: default`, function() {
			var stdio = undefined
			describeExitAndCloseEvents(stdio)
		})

		describe(`stdio: ['pipe', 'pipe', 'pipe']`, function() {
			var stdio = ['pipe', 'pipe', 'pipe']
			describeExitAndCloseEvents(stdio)
		})

		describe(`stdio: ['pipe', 'pipe', 'pipe', 'ipc']`, function() {
			var stdio = ['pipe', 'pipe', 'pipe', 'ipc']
			describeExitAndCloseEvents(stdio)
		})

		// TODO: these tests throw because additional pipes are unprotected from using
		// and they prevent closing.
		// The tests pass, but internally the ChildProcess instance doesnt get destroyed
		// without having to call kill().
		describe(`stdio: ['pipe', 'pipe', 'pipe', 'pipe', 'pipe']`, function() {
			var stdio = ['pipe', 'pipe', 'pipe', 'pipe', 'pipe']
			describeExitAndCloseEvents(stdio)
		})

		describe(`stdio: [null, null, null]`, () => {
			var stdio = [null, null, null]
			describeExitAndCloseEvents(stdio)
		})

		describe(`stdio: [null, null, null, 'ipc']`, () => {
			var stdio = [null, null, null, 'ipc']
			describeExitAndCloseEvents(stdio)
		})

	})


	function testEmitsExit(stdio, scriptPath) {
		it(`emits exit 0 when script ends ${scriptPath}`, async () => {
			var child = spawn(NODE, [scriptPath], {stdio})
			var exitCode = await promiseEvent(child, 'exit')
			assert.equal(exitCode, 0)
		})
	}

	function testEmitsClose(stdio, scriptPath) {
		it(`emits exit 0 when script ends ${scriptPath}`, async () => {
			var child = spawn(NODE, [scriptPath], {stdio})
			var exitCode = await promiseEvent(child, 'close')
			assert.equal(exitCode, 0)
		})
	}

	function testEmitsStdoutAndStderrBeforeClose(stdio, scriptPath) {
		it(`emits stdout and stderr before 'close'`, async () => {
			var child = spawn(NODE, [scriptPath], {stdio})
			var [outBuffer, errBuffer] = await Promise.all([
				promiseEvent(child.stdout, 'data'),
				promiseEvent(child.stderr, 'data'),
			])
			assert.isNotEmpty(outBuffer)
			assert.isNotEmpty(errBuffer)
			var exitCode = await promiseEvent(child, 'close')
		})
	}

	function parentDoesntHaveIpcMethods(stdio) {
		it(`parent does not have IPC methods .send() and .disconnect()`, async () => {
			var child = spawn(NODE, [scriptIpcComplex], {stdio})
			//assert.isFalse(child.connected, 'process.connected should exist and be false') // TODO: not critical but could be fixed in the future
			assert.isUndefined(child.send, 'process.send() should not exists')
			assert.isUndefined(child.disconnect, 'process.disconnect() should not exist')
			await child.kill()
		})
	}

	function parentHasIpcMethods(stdio) {
		it(`parent has IPC methods .send() and .disconnect()`, async () => {
			var child = spawn(NODE, [scriptIpcComplex], {stdio})
			//assert.isTrue(child.connected, 'process.connected should exist and be true') // TODO: not critical but could be fixed in the future
			assert.isFunction(child.send, 'process.send() should exist')
			assert.isFunction(child.disconnect, 'process.disconnect() should exist')
			await child.kill()
		})
	}

	function childDoesntHaveIpcMethods(stdio) {
		it(`child does not have IPC methods .send() and .disconnect() on parent object`, async () => {
			var child = spawn(NODE, [scriptIpcComplex], {stdio})
			var childProcessObject = JSON.parse(await promiseEvent(child.stdout, 'data'))
			//assert.isUndefined(childProcessObject.connected, 'process.connected should be undefined') // TODO: not critical but could be fixed in the future
			assert.equal(childProcessObject.send, 'undefined', 'process.send() should not exists')
			assert.equal(childProcessObject.disconnect, 'undefined', 'process.disconnect() should not exist')
			await child.kill()
		})
	}

	function childHasIpcMethods(stdio) {
		it(`child has IPC methods .send() and .disconnect() on process object`, async () => {
			var child = spawn(NODE, [scriptIpcComplex], {stdio})
			var childProcessObject = JSON.parse(await promiseEvent(child.stdout, 'data'))
			//assert.isTrue(childProcessObject.connected, 'process.connected should exist and be true') // TODO: not critical but could be fixed in the future
			assert.equal(childProcessObject.send, 'function', 'process.send() should exist')
			assert.equal(childProcessObject.disconnect, 'function', 'process.disconnect() should exist')
			await child.kill()
		})
	}

	function describeExitAndCloseEvents(stdio) {
		describe(`IPC`, function() {
			if (stdio && stdio.includes('ipc')) {
				parentHasIpcMethods(stdio)
				childHasIpcMethods(stdio)
			} else {
				parentDoesntHaveIpcMethods(stdio)
				childDoesntHaveIpcMethods(stdio)
			}
		})
		describe(`'exit' and 'close' events`, function() {
			testEmitsExit(stdio, scriptSimple)
			testEmitsClose(stdio, scriptSimple)
			testEmitsExit(stdio, scriptDelayed)
			testEmitsClose(stdio, scriptDelayed)
			testEmitsStdoutAndStderrBeforeClose(stdio, scriptSimple)
		})
	}



})
