var {assert} = require('chai')
var {spawn} = require('child_process')


const STDOUT_MESSAGE_IPC = 'i am child with IPC\n'
const STDOUT_MESSAGE_NO_IPC = 'i am child without IPC\n'

async function stdoutWithIpc(proc) {
	var out = await awaitEvent(proc.stdout, 'data')
	assert.equal(out, STDOUT_MESSAGE_IPC)
}
async function stdoutWithoutIpc(proc) {
	var out = await awaitEvent(proc.stdout, 'data')
	assert.equal(out, STDOUT_MESSAGE_NO_IPC)
}

function awaitEvent(emitter, name) {
	return new Promise(resolve => {
		emitter.once(name, resolve)
	})	
}


/*
describe('cleanup of custom arguments in child process', () => {

	it(`default stdio`, async () => {
		var proc = spawn('node', ['child.js'])
		await stdoutWithoutIpc(proc)
	})

	it(`added ipc arg is hidden after implementation`, async () => {
		var env = {
			'uwp-node-stdio-ipc': '4',
			'uwp-node-stdio': 'ipcpipename',
			'uwp-node-broker-pipe': 'mypipe',
		}
		var proc = spawn('node', ['child-env.js'], {env})
		//proc.stdout.on('data', err => console.log(err.toString()))
		//proc.stderr.on('data', err => console.log(err.toString()))
		var json = (await awaitEvent(proc.stdout, 'data')).toString().trim()
		assert.notInclude(json, 'uwp-node-stdio-ipc')
		assert.notInclude(json, 'uwp-node-stdio')
		assert.notInclude(json, 'uwp-node-broker-pipe')
	})

})
*/

/*
describe('spawn - basic stdio', () => {

	it(`default`, async () => {
		var proc = spawn('node', ['child.js'])
		assert.exists(proc.stdin, 'stdin should exist')
		assert.exists(proc.stdout, 'stdout should exists')
		assert.exists(proc.stderr, 'stderr should exist')
		assert.lengthOf(proc.stdio, 3)
		await stdoutWithoutIpc(proc)
	})

	it(`'pipe'`, async () => {
		var stdio = 'pipe'
		var proc = spawn('node', ['child.js'], {stdio})
		assert.exists(proc.stdin, 'stdin should exist')
		assert.exists(proc.stdout, 'stdout should exists')
		assert.exists(proc.stderr, 'stderr should exist')
		assert.lengthOf(proc.stdio, 3)
		await stdoutWithoutIpc(proc)
	})

	it(`['pipe', 'pipe', 'pipe']`, async () => {
		var stdio = ['pipe', 'pipe', 'pipe']
		var proc = spawn('node', ['child.js'], {stdio})
		assert.exists(proc.stdin, 'stdin should exist')
		assert.exists(proc.stdout, 'stdout should exists')
		assert.exists(proc.stderr, 'stderr should exist')
		assert.lengthOf(proc.stdio, 3)
		await stdoutWithoutIpc(proc)
	})

	it(`'ignore'`, async () => {
		var stdio = 'ignore'
		var proc = spawn('node', ['child.js'], {stdio})
		assert.isNull(proc.stdin, 'stdin should not exist')
		assert.isNull(proc.stdout, 'stdout should not exist')
		assert.isNull(proc.stderr, 'stderr should not exist')
	})

	it(`['ignore']`, async () => {
		var stdio = ['ignore']
		var proc = spawn('node', ['child.js'], {stdio})
		assert.isNull(proc.stdin, 'stdin should not exist')
		assert.exists(proc.stdout, 'stdout should exists')
		assert.exists(proc.stderr, 'stderr should exist')
		assert.lengthOf(proc.stdio, 3)
		assert.isNull(proc.stdio[0])
		assert.exists(proc.stdio[1])
		assert.exists(proc.stdio[2])
	})

	it(`['ignore', 'ignore', 'ignore']`, async () => {
		var stdio = ['ignore', 'ignore', 'ignore']
		var proc = spawn('node', ['child.js'], {stdio})
		assert.isNull(proc.stdin, 'stdin should not exist')
		assert.isNull(proc.stdout, 'stdout should not exist')
		assert.isNull(proc.stderr, 'stderr should not exist')
		assert.lengthOf(proc.stdio, 3)
	})

	it(`null`, async () => {
		var stdio = null
		var proc = spawn('node', ['child.js'], {stdio})
		assert.exists(proc.stdin, 'stdin should exist')
		assert.exists(proc.stdout, 'stdout should exists')
		assert.exists(proc.stderr, 'stderr should exist')
		await stdoutWithoutIpc(proc)
	})

	it(`[null, null, null]`, async () => {
		var stdio = [null, null, null]
		var proc = spawn('node', ['child.js'], {stdio})
		assert.exists(proc.stdin, 'stdin should exist')
		assert.exists(proc.stdout, 'stdout should exists')
		assert.exists(proc.stderr, 'stderr should exist')
		assert.lengthOf(proc.stdio, 3)
		assert.exists(proc.stdio[0])
		assert.exists(proc.stdio[1])
		assert.exists(proc.stdio[2])
		await stdoutWithoutIpc(proc)
	})

	it(`[0, 1, 2] redirects child's stdout to main process' stdout`, async () => {
		var stdio = [0, 1, 2]
		var proc = spawn('node', ['child.js'], {stdio})
		assert.isNull(proc.stdin, 'stdin should not exist')
		assert.isNull(proc.stdout, 'stdout should not exist')
		assert.isNull(proc.stderr, 'stderr should not exist')
		assert.lengthOf(proc.stdio, 3)
		await awaitEvent(proc, 'exit')
	})

	it(`[process.stdin, process.stdout, process.stderr] redirects child's stdout to main process' stdout`, async () => {
		var stdio = [process.stdin, process.stdout, process.stderr]
		var proc = spawn('node', ['child.js'], {stdio})
		assert.isNull(proc.stdin, 'stdin should not exist')
		assert.isNull(proc.stdout, 'stdout should not exist')
		assert.isNull(proc.stderr, 'stderr should not exist')
		assert.lengthOf(proc.stdio, 3)
		await awaitEvent(proc, 'exit')
	})

})
*/
/*
describe('spawn - stdio with 4 args or ipc', () => {

	it(`[null, null, null, null]`, async () => {
		var stdio = [null, null, null, null]
		var proc = spawn('node', ['child.js'], {stdio})
		assert.exists(proc.stdin, 'stdin should exist')
		assert.exists(proc.stdout, 'stdout should exists')
		assert.exists(proc.stderr, 'stderr should exist')
		assert.isUndefined(proc.send, 'process.send() does not exist because ipc was not created')
		assert.lengthOf(proc.stdio, 4)
		assert.exists(proc.stdio[0])
		assert.exists(proc.stdio[1])
		assert.exists(proc.stdio[2])
		assert.isNull(proc.stdio[3])
		await stdoutWithoutIpc(proc)
	})

	it(`[null, null, null, 'ignore']`, async () => {
		var stdio = [null, null, null, 'ignore']
		var proc = spawn('node', ['child.js'], {stdio})
		assert.exists(proc.stdin, 'stdin should exist')
		assert.exists(proc.stdout, 'stdout should exists')
		assert.exists(proc.stderr, 'stderr should exist')
		assert.isUndefined(proc.send, 'process.send() does not exist because ipc was not created')
		assert.lengthOf(proc.stdio, 4)
		assert.exists(proc.stdio[0])
		assert.exists(proc.stdio[1])
		assert.exists(proc.stdio[2])
		assert.isNull(proc.stdio[3])
		await stdoutWithoutIpc(proc)
	})

	it(`[undefined, 'ignore', 'pipe', null]`, async () => {
		var stdio = [undefined, 'ignore', 'pipe', null]
		var proc = spawn('node', ['child.js'], {stdio})
		assert.exists(proc.stdin, 'stdin should exist')
		assert.isNull(proc.stdout, 'stdout should not exist')
		assert.exists(proc.stderr, 'stderr should exist')
		assert.lengthOf(proc.stdio, 4)
		assert.isNull(proc.stdio[3])
		assert.isUndefined(proc.send, 'process.send() does not exist because ipc was not created')
	})

	it(`['ignore', 'pipe', 'pipe', 'ipc']`, async () => {
		var stdio = ['ignore', 'pipe', 'pipe', 'ipc']
		var proc = spawn('node', ['child.js'], {stdio})
		assert.isNull(proc.stdin, 'stdin should not exist')
		assert.exists(proc.stdout, 'stdout should exists')
		assert.exists(proc.stderr, 'stderr should exist')
		assert.isNull(proc.stdio[3], `ipc is not represented as stream in proc.stdio, process.send()/on('message') are used instead`)
		assert.lengthOf(proc.stdio, 4)
		assert.isNull(proc.stdio[0])
		assert.exists(proc.stdio[1])
		assert.exists(proc.stdio[2])
		await stdoutWithIpc(proc)
	})

	it(`['pipe', 1, 2, 'ipc'] shares stdout and stderr + creates stdio and ipc stream`, async () => {
		var stdio = ['pipe', 1, 2, 'ipc']
		var proc = spawn('node', ['child.js'], {stdio})
		assert.exists(proc.stdin, 'stdin should exist')
		assert.isNull(proc.stdout, 'stdout should not exist')
		assert.isNull(proc.stderr, 'stderr should not exist')
		assert.exists(proc.send, 'process.send() exists because of ipc')
		assert.lengthOf(proc.stdio, 4)
		assert.exists(proc.stdio[0])
		assert.isNull(proc.stdio[1])
		assert.isNull(proc.stdio[2])
		assert.isNull(proc.stdio[3], `ipc is not represented as stream in proc.stdio, process.send()/on('message') are used instead`)
		//await stdoutWithIpc(proc)
	})

})
*/

describe('spawn - additional ipc methods and propeties', () => {

	it(`[null, null, null] shares stdout and stderr + creates stdio and ipc stream`, async () => {
		var stdio = [null, null, null]
		var proc = spawn('node', ['child-ipc.js'], {stdio})
		proc.stdout.on('data', err => console.log(err.toString()))
		proc.stderr.on('data', err => console.log(err.toString()))
		assert.isFalse(proc.connected, 'process.connected exists (and is false) despite ipc')
		assert.isUndefined(proc.send, 'process.send() does not exists because of ipc')
		assert.isUndefined(proc.disconnect, 'process.disconnect() does not exists because of ipc')
	})

	it(`[null, null, null, 'ipc'] shares stdout and stderr + creates stdio and ipc stream`, async () => {
		var stdio = [null, null, null, 'ipc']
		var proc = spawn('node', ['child-ipc.js'], {stdio})
		proc.stdout.on('data', err => console.log(err.toString()))
		proc.stderr.on('data', err => console.log(err.toString()))
		assert.isTrue(proc.connected, 'process.connected exists (and is true) because of ipc')
		assert.exists(proc.send, 'process.send() exists because of ipc')
		assert.exists(proc.disconnect, 'process.disconnect() exists because of ipc')
	})

})