import fs from 'fs'
import notify from 'rollup-plugin-notify'


var pkg = JSON.parse(fs.readFileSync('package.json').toString())
var nodeCoreModules = require('repl')._builtinLibs
var external = [...nodeCoreModules, ...Object.keys(pkg.dependencies || {})]
var globals = objectFromArray(external)

var format = 'umd'
var name = 'uwp-node'

var plugins = [
	notify()
]

export default [
	{
		external,
		input: 'src/index.mjs',
		output: {
			file: `index.js`,
			format, name, globals,
		},
		plugins,
	}, {
		external,
		input: 'src/uwp.mjs',
		output: {
			file: `uwp.js`,
			format, name, globals,
		},
		plugins,
	}, {
		external,
		input: 'src/node.mjs',
		output: {
			file: `node.js`,
			format, name, globals,
		},
		plugins,
	}, {
		external,
		input: 'src/util.mjs',
		output: {
			file: `util.js`,
			format, name, globals,
		},
		plugins,
	}
]

function objectFromArray(arr) {
	var obj = {}
	arr.forEach(moduleName => obj[moduleName] = moduleName)
	return obj
}