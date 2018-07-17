var {assert} = require('chai')
// hacky, but works, these are either node's child_process or uwp-node mocks.
var {spawn, exec} = global
var {NODE, promiseEvent, promiseTimeout} = require('./test-util.js')


// TODO: MORE TESTS:
//       - exitcode tests, file that throws, self closing file, etc...

var scriptEnv         = './fixtures/child-env.js'
var scriptArgs        = './fixtures/args.js'
var scriptNewlines    = './fixtures/newlines.js'
var scriptSimple      = './fixtures/simple.js'
var scriptDelayed     = './fixtures/simple-delayed.js'
var scriptEndless     = './fixtures/simple-endless.js'
var scriptIpcBasic    = './fixtures/child-ipc-basic.js'
var scriptIpcListener = './fixtures/child-ipc-listener.js'
var scriptIpcComplex  = './fixtures/child-ipc-complex.js'
var scriptWithSpaces  = './fixtures/name with spaces.js'



describe('internals', function() {
})

describe('args', function() {

	it(`basic args support`, async () => {
		var myArgs = ['first', 'second', 'third']
		var child = spawn(NODE, [scriptArgs, ...myArgs])
		var args = JSON.parse(await promiseEvent(child.stdout, 'data'))
		assert.deepEqual(args, myArgs)
	})

	it(`args are sanitized`, async () => {
		var myArgs = ['hello world', '"C:\\Program Filles/node"', 'k\nthx\nbye']
		var child = spawn(NODE, [scriptArgs, ...myArgs])
		var args = JSON.parse(await promiseEvent(child.stdout, 'data'))
		assert.deepEqual(args, myArgs)
	})

	it(`args are sanitized (filename with spaces)`, async () => {
		var arg = 'foobar'
		var child = spawn(NODE, [scriptWithSpaces, arg])
		var args = await promiseEvent(child.stdout, 'data')
		assert.deepEqual(args.toString().trim(), arg)
	})
/*
	it(`args are sanitized (exec)`, async () => {
		var {stdout} = await exec('echo "hello world"')
		assert.deepEqual(stdout.trim(), '"hello world"')
	})
*/

	function testSanitizeSpaceSpawn(input, expected) {
		it(`spawn args spaces and quotes ${input} => ${expected}`, async () => {
			var child = spawn('cmd.exe', ['/c', 'echo', input])
			var stdout = await promiseEvent(child.stdout, 'data')
			assert.equal(stdout.toString().trim(), expected)
		})
	}

	function testSanitizeSpaceExec(input, expected) {
		it(`exec args spaces and quotes ${input} => ${expected}`, async () => {
			var {stdout} = await exec(`echo ${input}`)
			assert.equal(stdout.trim(), expected)
		})
	}

	testSanitizeSpaceExec( 'hello',  'hello')
	testSanitizeSpaceSpawn( 'hello',  'hello')
	testSanitizeSpaceExec( 'hello world',  'hello world')
	testSanitizeSpaceSpawn('hello world', '"hello world"')
	testSanitizeSpaceExec( '"hello world"',    '"hello world"')
	testSanitizeSpaceSpawn('"hello world"', '"\\"hello world\\""')
	testSanitizeSpaceExec( '""hello world""', '""hello world""')
	testSanitizeSpaceSpawn('""hello world""', '"\\"\\"hello world\\"\\""')
	testSanitizeSpaceExec( '"""hello world"""',        '"""hello world"""')
	testSanitizeSpaceSpawn('"""hello world"""', '"\\"\\"\\"hello world\\"\\"\\""')
	testSanitizeSpaceExec( '"hello" "world"', '"hello" "world"')
	testSanitizeSpaceSpawn('"hello" "world"', '"\\"hello\\" \\"world\\""')
	testSanitizeSpaceExec( '\'hello\' \'world\'',  '\'hello\' \'world\'')
	testSanitizeSpaceSpawn('\'hello\' \'world\'', '"\'hello\' \'world\'"')
	testSanitizeSpaceExec( '`hello world`',  '`hello world`')
	testSanitizeSpaceSpawn('`hello world`', '"`hello world`"')
	testSanitizeSpaceExec( '\'hello world\'',  '\'hello world\'')
	testSanitizeSpaceSpawn('\'hello world\'', '"\'hello world\'"')


})


describe('encoding', function() {

	it(`should receive ě on stdout`, async () => {
		var child = spawn(NODE, ['./fixtures/encoding1.js'])
		var stdout = await promiseEvent(child.stdout, 'data')
		assert.equal(stdout.toString().trim(), 'ě')
	})
	
	it(`should receive 💀 on stdout`, async () => {
		var child = spawn(NODE, ['./fixtures/encoding2.js'])
		var stdout = await promiseEvent(child.stdout, 'data')
		assert.equal(stdout.toString().trim(), '💀')
	})
	
	it(`should receive 💀 on stdout (exec)`, async () => {
		var {stdout} = await exec(`"${NODE}" ./fixtures/encoding2.js`)
		assert.equal(stdout.toString().trim(), '💀')
	})

	it(`args support special characters`, async () => {
		var myArgs = ['ě', 'éí|]', '💀']
		var child = spawn(NODE, [scriptArgs, ...myArgs])
		var args = JSON.parse(await promiseEvent(child.stdout, 'data'))
		assert.deepEqual(args, myArgs)
	})

})

describe('errors', function() {

	it(`spawning file instead of program throws or emits UNKNOWN serror`, async () => {
		// Some node errors are sync. We can only get async errors.
		var child
		var err
		try {
			child = spawn('./fixtures/simple.js')
			err = await promiseEvent(child, 'error')
		} catch(error) {
			err = error
		}
		assert.instanceOf(err, Error, 'should throw or emit error')
		assert.equal(err.code, 'UNKNOWN', 'error code should be UNKNOWN')
	})


	it(`stderr spits & exit code is 1 if node script is missing`, async () => {
		var child = spawn(NODE, ['404.js'])
		child.on('error', err => console.error(err))
		var stdout = ''
		var stderr = ''
		child.stdout.on('data', data => stdout += data)
		child.stderr.on('data', data => stderr += data)
		var code = await promiseEvent(child, 'exit')
		assert.isEmpty(stdout)
		assert.isNotEmpty(stderr)
		assert.equal(code, 1)
	})

	it(`missing program is missing emits 'error' event`, async () => {
		var child = spawn('404.exe')
		var exitFired = false
		child.once('exit', code => exitFired = true)
		var err = await promiseEvent(child, 'error')
		assert.isDefined(err)
		assert.include(err.message, 'ENOENT')
		assert.equal(err.code, 'ENOENT')
		assert.isNumber(child.exitCode)
		assert.isBelow(child.exitCode, 0)
		assert.isFalse(exitFired)
	})

/*
	it(`throws error for missing file`, async () => {
		try {
			var {stdout, stderr} = await exec(`"${NODE}" 404.js`)
			console.log('stdout', stdout)
			console.log('stderr', stderr)
		} catch(err) {
			console.log('ERR', err)
		}
	})
*/
})

describe('cleanup & pollution', function() {

	it(`args are not polluted`, async () => {
		var child = spawn(NODE, [scriptArgs])
		var args = JSON.parse(await promiseEvent(child.stdout, 'data'))
		assert.isEmpty(args)
	})

	it(`process.env is not polluted`, async () => {
		var stdio = [null, 'pipe', null, 'ipc']
		var child = spawn(NODE, [scriptEnv], {stdio})
		var json = ''
		child.stdout.on('data', buffer => json += buffer)
		await promiseEvent(child, 'exit')
		var env = JSON.parse(json)
		var found = Object.keys(env).find(key => key.startsWith('uwp-node'))
		assert.isUndefined(found, 'env should not conain uwp-node-* keys')
	})

})

describe('basic stdio', function() {

	// NOTE: \r get lost due to of C#'s way of capturing stdout. But \n are ok.
	it(`stdout properly handles newlines`, async () => {
		var child = spawn(NODE, [scriptNewlines])
		var stdout = ''
		child.stdout.on('data', data => stdout += data)
		await promiseEvent(child, 'exit')
		var actual   = 'hello\nworld\r\nfoo\nbar\nk\nthx\nbye\n'
		var expected = 'hello\nworld\nfoo\nbar\nk\nthx\nbye\n'
		assert.equal(stdout, expected)
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

})

describe(`basic closing and killing, 'exit' & 'close' events`, function() {

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



describe(`stdio variations`, function() {

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
