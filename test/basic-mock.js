var {compileIfNeeded} = require('./testerCompiler.js')
var mockUwp = require('./uwpMock.js')
var {spawn} = require('../index.js')


var log = console.log.bind(console)

compileIfNeeded()
	.then(mockUwp)
	.then(startNode)

function startNode() {
	console.log('startNode')

	var program = process.execPath
	//var scriptPath = './js/testserver.js'
	var scriptPath = './fixtures/simple.js'
	var stdio = ['pipe', 'pipe', 'pipe', 'ipc']

	node = spawn(program, [scriptPath], {stdio})

	if (node.stdin) {
		node.stdin.on('end', () => log(`NODE stdin end`))
	}
	if (node.stdout) {
		node.stdout.on('data', data => log(`NODE stdout: ${data}`.trim()))
		node.stdout.on('end', () => log(`NODE stdout end`))
		node.stdout.on('close', () => log(`NODE stdout close`))
	}
	if (node.stderr) {
		node.stderr.on('data', data => log(`NODE stderr: ${data}`.trim()))
		node.stderr.on('end', () => log(`NODE stderr end`))
		node.stderr.on('close', () => log(`NODE stderr close`))
	}

	node.on('message', message => {
		log('NODE ipc message:', message)
	})

	node.on('error', error => {
		log('NODE error:', error)
	})

	node.once('exit', (code, signal) => {
		log(`NODE exit: child process exited with code ${code}, ${signal}`)
	})

	node.once('close', (code, signal) => {
		log(`NODE close: all child process stdio streams have been closed, exitcode ${code}, signal ${signal}`)
	})

	return new Promise(resolve => node.once('exit', resolve))
}