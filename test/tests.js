var {assert} = require('chai')
// hacky, but works, these are either node's child_process or uwp-node mocks.
var {spawn, exec, isMock, broker} = global
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
var scriptIpcSender   = './fixtures/child-ipc-sender.js'
var scriptIpcComplex  = './fixtures/child-ipc-complex.js'


/*
TODO:
const subprocess = child_process.spawn('ls', {
  stdio: [
    0, // Use parent's stdin for child
    'pipe', // Pipe child's stdout to parent
    fs.openSync('err.out', 'w') // Direct child's stderr to a file
  ]
});

assert.strictEqual(subprocess.stdio[0], null);
assert.strictEqual(subprocess.stdio[0], subprocess.stdin);

assert(subprocess.stdout);
assert.strictEqual(subprocess.stdio[1], subprocess.stdout);

assert.strictEqual(subprocess.stdio[2], null);
assert.strictEqual(subprocess.stdio[2], subprocess.stderr);
*/

/*
TODO:
// Child will use parent's stdios
spawn('prg', [], { stdio: 'inherit' });

// Spawn child sharing only stderr
spawn('prg', [], { stdio: ['pipe', 'pipe', process.stderr] });

// Open an extra fd=4, to interact with programs presenting a
// startd-style interface.
spawn('prg', [], { stdio: ['pipe', null, null, null, 'pipe'] });
*/


describe('spawn args sanitization and encoding', function() {

	it(`basic args support`, async () => {
		var args = ['first', 'second', 'third']
		var child = spawn(NODE, [scriptArgs, ...args])
		var output = JSON.parse(await promiseEvent(child.stdout, 'data'))
		assert.deepEqual(output, args)
	})


	function testSanitizeArgsSpawn(...args) {
		it(`args are sanitized: ${args.join(' ').replace(/\n/g, '\\n')}`, async () => {
			var child = spawn(NODE, [scriptArgs, ...args])
			var stdout = await promiseEvent(child.stdout, 'data')
			var output = JSON.parse(stdout)
			assert.deepEqual(output, args)
		})
	}

	// basics
	testSanitizeArgsSpawn(' ')
	testSanitizeArgsSpawn('\'')
	testSanitizeArgsSpawn('\"')
	testSanitizeArgsSpawn('\\')
	testSanitizeArgsSpawn('\s')
	testSanitizeArgsSpawn('\t')
	testSanitizeArgsSpawn('\n')
	testSanitizeArgsSpawn('€')
	testSanitizeArgsSpawn('💀')
	testSanitizeArgsSpawn('~!@#$%^^^&*()_+^|-=^\][{}\';:\"/.^>?,^<')
	// more
	testSanitizeArgsSpawn('hello')
	testSanitizeArgsSpawn('"hello"')
	testSanitizeArgsSpawn('hello world')
	testSanitizeArgsSpawn('"hello world"')
	testSanitizeArgsSpawn('""hello world""')
	testSanitizeArgsSpawn('"""hello world"""')
	// seemingly two in one
	testSanitizeArgsSpawn('"hello" "world"')
	// different quotes
	testSanitizeArgsSpawn('`hello world`')
	testSanitizeArgsSpawn('\'hello world\'')
	// slashes and escaping
	testSanitizeArgsSpawn('\\"hello\\"')
	testSanitizeArgsSpawn('foo\nbar')
	testSanitizeArgsSpawn('foo bar')
	testSanitizeArgsSpawn('foo bar\\')
	// more complex
	testSanitizeArgsSpawn('"test\\"\\"123\\"\\"234"')
	testSanitizeArgsSpawn('\'hello\' \'world\'')
	// clusterfuck
	testSanitizeArgsSpawn('hello world', '"C:\\Program Filles/node"', 'k\nthx\nbye')
	testSanitizeArgsSpawn("arg1", "an argument with whitespace", 'even some "quotes"')
	// what the hell?
	testSanitizeArgsSpawn('\\"hello\\ world')
	testSanitizeArgsSpawn('\\hello\\12\\3\\')
	testSanitizeArgsSpawn('hello world\\')
	testSanitizeArgsSpawn('\\ ')
	testSanitizeArgsSpawn('\\foo bar')
	testSanitizeArgsSpawn('foo\\bar')
	testSanitizeArgsSpawn('foo\\ bar')
	testSanitizeArgsSpawn('foo \\bar')
	testSanitizeArgsSpawn('foo\\nbar')


})


describe('stdio encoding', function() {

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

	describe('spawn', () => {

		it(`file instead of program - throws UNKNOWN or emits 'error'`, async () => {
			// Some node errors are sync. We can only get async errors.
			var child
			var err
			try {
				child = spawn(scriptSimple)
				err = await promiseEvent(child, 'error')
			} catch(error) {
				err = error
			}
			assert.instanceOf(err, Error, 'should throw or emit error')
			assert.equal(err.code, 'UNKNOWN', 'error code should be UNKNOWN')
		})

		it(`non-existent node script - emits 'stderr' logs & exit code is 1`, async () => {
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

		it(`non-existent exe program - emits 'error'`, async () => {
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

	})

	describe('exec', () => {

		it(`file instead of program - throws exit code 1, includes stderr`, async () => {
			var err
			try {
				await exec(scriptSimple)
			} catch(error) {
				err = error
			}
			assert.instanceOf(err, Error, 'should throw error')
			assert.include(err.message, 'Command failed')
			assert.include(err.message, scriptSimple)
			assert.isString(err.stdout)
			assert.isString(err.stderr)
			assert.isEmpty(err.stdout)
			assert.isNotEmpty(err.stderr) // the cmd stuff about not recognized command
			assert.equal(err.cmd, scriptSimple)
			assert.equal(err.code, 1)
		})

		it(`non-existent node script - throws, exit code 1, includes stderr`, async () => {
			var cmd = `"${NODE}" 404.js`
			var err
			try {
				await exec(cmd)
			} catch(error) {
				err = error
			}
			assert.instanceOf(err, Error, 'should throw error')
			assert.include(err.message, 'Command failed')
			assert.include(err.message, '404.js')
			assert.isString(err.stdout)
			assert.isString(err.stderr)
			assert.isEmpty(err.stdout)
			assert.include(err.stderr, 'Cannot find module')
			assert.equal(err.cmd, cmd)
			assert.equal(err.code, 1)
		})

		it(`non-existent program - throws, exit code 1, includes stderr`, async () => {
			var err
			try {
				await exec(`404.exe`)
			} catch(error) {
				err = error
			}
			assert.instanceOf(err, Error, 'should throw error')
			assert.isString(err.stdout)
			assert.isString(err.stderr)
			assert.equal(err.code, 1)
		})

	})

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


	describe('inherit', function() {

		// NOTE: \r get lost due to of C#'s way of capturing stdout. But \n are ok.
		it(`child.stdout and child.stderr are null`, async () => {
			var stdio = 'inherit'
			var child = spawn(NODE, [scriptSimple], {stdio})
			assert.isNull(child.stdout)
			assert.isNull(child.stderr)
			await child.kill()
		})

// This just canno be reliably tested
/*
		if (isMock) {

			// NOTE: \r get lost due to of C#'s way of capturing stdout. But \n are ok.
			it(`'inherit' pipes all children stdio into parent`, async () => {
				var logs = []
				var errors = []
				var stdout_write = process.stdout.write
				process.stdout.write = (chunks, encoding, fd) => {
					logs.push(chunks.toString().trim())
					return stdout_write.call(process.stdout, chunks, encoding, fd)
				}
				var stderr_write = process.stderr.write
				process.stderr.write = (chunks, encoding, fd) => {
					errors.push(chunks.toString().trim())
					return stderr_write.call(process.stderr, chunks, encoding, fd)
				}
				var child
				try {
					var stdio = 'inherit'
					child = spawn(NODE, [scriptSimple], {stdio})
					await promiseEvent(child, 'exit')
				} catch(err) {}
				process.stdout.write = stdout_write
				process.stderr.write = stderr_write
				assert.isNotEmpty(logs)
				assert.isNotEmpty(errors)
				assert.include(logs, 'console.log > stdout')
				assert.include(errors, 'console.error > stderr')
				await child.kill()
			})

		}
*/
	})

})


describe('public IPC', () => {

	describe(`parent sends message via child.send(), child receives it via process.on('message')`, () => {

		function basicIpcMessage(message) {
			if (message === null)
				var type = 'null'
			else if (Array.isArray(message))
				var type = 'Array'
			else if (Buffer.isBuffer(message))
				var type = 'Buffer'
			else
				var type = message.constructor.name
			it(`${type}`, async () => {
				var stdio = ['pipe', 'pipe', 'pipe', 'ipc']
				var child = spawn(NODE, [scriptIpcListener], {stdio})
				child.send(message)
				var stdout = await promiseEvent(child.stdout, 'data')
				var output = JSON.parse(stdout)
				assert.deepEqual(output, message)
			})
		}

		basicIpcMessage(null)
		basicIpcMessage(45)
		basicIpcMessage(true)
		basicIpcMessage(false)
		basicIpcMessage('hello world')
		basicIpcMessage(['Zenyatta', 'Moira', 'Winston'])
		basicIpcMessage({foo: 'bar'})

		it(`Buffer`, async () => {
			var stdio = ['pipe', 'pipe', 'pipe', 'ipc']
			var child = spawn(NODE, [scriptIpcListener], {stdio})
			var array = [0, 1, 2, 3]
			var buffer = Buffer.from(array)
			child.send(buffer)
			var output = JSON.parse(await promiseEvent(child.stdout, 'data'))
			// Buffer is not reconstructed as Buffer instance.
			// Instead it's an object with 'type' and 'data' fields.
			assert.equal(output.type, 'Buffer')
			assert.deepEqual(output.data, array)
		})

		it(`undefined sends nothing and throws`, async () => {
			var stdio = ['pipe', 'pipe', 'pipe', 'ipc']
			var child = spawn(NODE, [scriptIpcListener], {stdio})
			var err
			try {
				child.send(undefined)
			} catch(error) {
				err = error
			}
			await child.kill()
			assert.instanceOf(err, Error)
			assert.equal(err.code, 'ERR_MISSING_ARGS')
		})

		it(`send() throws if ipc channel is closed`, async () => {
			var stdio = ['pipe', 'pipe', 'pipe', 'ipc']
			var child = spawn(NODE, [scriptSimple], {stdio})
			await promiseEvent(child, 'exit')
			// this does not throw but emits 'error' event.
			// and if there's no listener it just prints it anyway.
			await child.send('hai')
			// Error is emitted in text tick
			var err = await promiseEvent(child, 'error')
			assert.instanceOf(err, Error)
			assert.equal(err.code, 'ERR_IPC_CHANNEL_CLOSED')
		})

	})

	describe(`child sends message via process.send(), parent receives it via child.on('message')`, () => {

		it(`receives messages`, async () => {
			var stdio = ['inherit', 'inherit', 'inherit', 'ipc']
			var child = spawn(NODE, [scriptIpcSender], {stdio})
			var messages = []
			child.on('message', message => messages.push(message))
			var now = Date.now()
			await promiseEvent(child, 'message')
			await promiseTimeout(500)
			assert.isNotEmpty(messages)
			await child.kill()
		})

		it(`receives all messages in correct order`, async () => {
			var stdio = ['inherit', 'inherit', 'inherit', 'ipc']
			var child = spawn(NODE, [scriptIpcSender], {stdio})
			var messages = []
			child.on('message', message => messages.push(message))
			await promiseEvent(child, 'message')
			await promiseTimeout(500)
			assert.isNotEmpty(messages)
			assert.equal(messages.length, 7)
			await child.kill()
		})

		it(`receives correct types`, async () => {
			var stdio = ['inherit', 'inherit', 'inherit', 'ipc']
			var child = spawn(NODE, [scriptIpcSender], {stdio})
			var messages = []
			child.on('message', message => messages.push(message))
			await promiseEvent(child, 'message')
			await promiseTimeout(500)
			assert.equal(messages[0], null)
			assert.equal(messages[1], 20)
			assert.equal(messages[2], true)
			assert.equal(messages[3], 'Nothing is true')
			assert.isArray(messages[4])
			assert.isObject(messages[5])
			// Buffer is not reconstructed as Buffer instance.
			// Instead it's an object with 'type' and 'data' fields.
			assert.isObject(messages[6])
			assert.equal(messages[6].type, 'Buffer')
			assert.equal(messages[6].data.length, 5)
			await child.kill()
		})

	})

})


isMock && describe('internal IPC', function() {
	// used for internal commands between broker and child scripts like
	// when bg script triggers broker to open UWP app.

	it(`UWP -> broker -> child process`, async () => {
		var child = spawn(NODE, ['./fixtures/child-iipc-listener.js'])
		broker.send('foobar')
		var stdout = (await promiseEvent(child.stdout, 'data')).toString().trim()
		assert.equal(stdout, 'foobar')
		await promiseEvent(child, 'exit')
	})

	it(`child process -> broker -> UWP`, async () => {
		var child = spawn(NODE, ['./fixtures/child-iipc-sender.js'], {stdio: 'inherit'})
		var cmd = (await promiseEvent(broker, 'message'))
		assert.equal(cmd, 'kthxbye')
		await child.kill()
		await promiseEvent(child, 'exit')
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
