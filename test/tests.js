var {assert} = require('chai')
// hacky, but works, these are either node's child_process or uwp-node mocks.
var {spawn, exec} = global
var {NODE, promiseEvent, promiseTimeout} = require('./test-util.js')



var scriptSimple = './fixtures/simple.js'
var scriptSimpleDelayed = './fixtures/simple-delayed.js'
var scriptIpcBasic = './fixtures/child-ipc-basic.js'
var scriptIpcComplex = './fixtures/child-ipc-complex.js'

describe('spawn', function() {

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
		})
	}

	function parentHasIpcMethods(stdio) {
		it(`parent has IPC methods .send() and .disconnect()`, async () => {
			var child = spawn(NODE, [scriptIpcComplex], {stdio})
			//assert.isTrue(child.connected, 'process.connected should exist and be true') // TODO: not critical but could be fixed in the future
			assert.isFunction(child.send, 'process.send() should exist')
			assert.isFunction(child.disconnect, 'process.disconnect() should exist')
		})
	}

	function childDoesntHaveIpcMethods(stdio) {
		it(`child does not have IPC methods .send() and .disconnect() on parent object`, async () => {
			var child = spawn(NODE, [scriptIpcComplex], {stdio})
			var childProcessObject = JSON.parse(await promiseEvent(child.stdout, 'data'))
			//assert.isUndefined(childProcessObject.connected, 'process.connected should be undefined') // TODO: not critical but could be fixed in the future
			assert.equal(childProcessObject.send, 'undefined', 'process.send() should not exists')
			assert.equal(childProcessObject.disconnect, 'undefined', 'process.disconnect() should not exist')
		})
	}

	function childHasIpcMethods(stdio) {
		it(`child has IPC methods .send() and .disconnect() on process object`, async () => {
			var child = spawn(NODE, [scriptIpcComplex], {stdio})
			var childProcessObject = JSON.parse(await promiseEvent(child.stdout, 'data'))
			//assert.isTrue(childProcessObject.connected, 'process.connected should exist and be true') // TODO: not critical but could be fixed in the future
			assert.equal(childProcessObject.send, 'function', 'process.send() should exist')
			assert.equal(childProcessObject.disconnect, 'function', 'process.disconnect() should exist')
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
		return
		describe(`'exit' and 'close' events`, function() {
			testEmitsExit(stdio, scriptSimple)
			testEmitsClose(stdio, scriptSimple)
			testEmitsExit(stdio, scriptSimpleDelayed)
			testEmitsClose(stdio, scriptSimpleDelayed)
			testEmitsStdoutAndStderrBeforeClose(stdio, scriptSimple)
			// TODO: add exitcode tests, throwing file, self closing file, killing it from here
		})
	}

/*
	describe(`stdio: default`, function() {
		var stdio = undefined
		describeExitAndCloseEvents(stdio)
	})

	describe(`stdio: ['pipe', 'pipe', 'pipe']`, function() {
		var stdio = ['pipe', 'pipe', 'pipe']
		describeExitAndCloseEvents(stdio)
	})
*/
	describe(`stdio: ['pipe', 'pipe', 'pipe', 'ipc']`, function() {
		var stdio = ['pipe', 'pipe', 'pipe', 'ipc']
		describeExitAndCloseEvents(stdio)
	})

	describe(`stdio: ['pipe', 'pipe', 'pipe', 'pipe', 'pipe']`, function() {
		var stdio = ['pipe', 'pipe', 'pipe', 'pipe', 'pipe']
		describeExitAndCloseEvents(stdio)
	})

	describe(`stdio: [null, null, null]`, () => {
		var stdio = [null, null, null]
		describeExitAndCloseEvents(stdio)
	})
/*
	describe(`stdio: [null, null, null, 'ipc']`, () => {
		var stdio = [null, null, null, 'ipc']
		describeExitAndCloseEvents(stdio)
	})
*/


})
