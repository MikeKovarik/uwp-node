var {assert} = require('chai')
// hacky, but works, these are either node's child_process or uwp-node mocks.
var {spawn, exec} = global


function promiseEvent(emitter, name) {
	return new Promise(resolve => {
		emitter.once(name, resolve)
	})	
}

var promiseTimeout = (millis = 0) => new Promise(resolve => setTimeout(resolve, millis))	


describe('spawn', function() {

	var execPath = process.execPath
	var scriptSimple = './fixtures/simple.js'
	var scriptSimpleDelayed = './fixtures/simple-delayed.js'

	function testEmitsExit(stdio, scriptPath) {
		it(`emits exit 0 when script ends ${scriptPath}`, async () => {
			var child = spawn(execPath, [scriptPath], {stdio})
			var exitCode = await promiseEvent(child, 'exit')
			assert.equal(exitCode, 0)
		})
	}

	function testEmitsClose(stdio, scriptPath) {
		it(`emits exit 0 when script ends ${scriptPath}`, async () => {
			var child = spawn(execPath, [scriptPath], {stdio})
			var exitCode = await promiseEvent(child, 'close')
			assert.equal(exitCode, 0)
		})
	}

	function testEmitsStdoutAndStderrBeforeClose(stdio, scriptPath) {
		it(`emits stdout and stderr before 'close'`, async () => {
			var child = spawn(execPath, [scriptPath], {stdio})
			var [outBuffer, errBuffer] = await Promise.all([
				promiseEvent(child.stdout, 'data'),
				promiseEvent(child.stderr, 'data'),
			])
			assert.isNotEmpty(outBuffer)
			assert.isNotEmpty(errBuffer)
			var exitCode = await promiseEvent(child, 'close')
		})
	}

	describe(`stdio: default`, function() {
		var stdio = undefined
		testEmitsExit(stdio, scriptSimple)
		testEmitsClose(stdio, scriptSimple)
		testEmitsStdoutAndStderrBeforeClose(stdio, scriptSimple)
		testEmitsExit(stdio, scriptSimpleDelayed)
		testEmitsClose(stdio, scriptSimpleDelayed)
	})

	describe(`stdio: ['pipe', 'pipe', 'pipe']`, function() {
		var stdio = ['pipe', 'pipe', 'pipe']
		testEmitsExit(stdio, scriptSimple)
		testEmitsClose(stdio, scriptSimple)
		testEmitsStdoutAndStderrBeforeClose(stdio, scriptSimple)
		testEmitsExit(stdio, scriptSimpleDelayed)
		testEmitsClose(stdio, scriptSimpleDelayed)
	})

	describe(`stdio: ['pipe', 'pipe', 'pipe', 'ipc']`, function() {
		var stdio = ['pipe', 'pipe', 'pipe', 'ipc']
		testEmitsExit(stdio, scriptSimple)
		testEmitsClose(stdio, scriptSimple)
		testEmitsStdoutAndStderrBeforeClose(stdio, scriptSimple)
		testEmitsExit(stdio, scriptSimpleDelayed)
		testEmitsClose(stdio, scriptSimpleDelayed)
	})
	describe(`stdio: ['pipe', 'pipe', 'pipe', 'pipe', 'pipe']`, function() {
		var stdio = ['pipe', 'pipe', 'pipe', 'pipe', 'pipe']
		testEmitsExit(stdio, scriptSimple)
		testEmitsClose(stdio, scriptSimple)
		testEmitsStdoutAndStderrBeforeClose(stdio, scriptSimple)
		testEmitsExit(stdio, scriptSimpleDelayed)
		testEmitsClose(stdio, scriptSimpleDelayed)
	})

})
