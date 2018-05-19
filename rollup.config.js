import fs from 'fs'


var pkg = JSON.parse(fs.readFileSync('package.json').toString())
var nodeCoreModules = require('repl')._builtinLibs
var external = [...nodeCoreModules, ...Object.keys(pkg.dependencies || {})]
var globals = objectFromArray(external)

export default [
	{
		//treeshake: false,
		external,
		input: 'src/index.mjs',
		output: {
			file: `index.js`,
			format: 'umd',
			name: 'uwp-node',
			globals,
		}
	}, {
		//treeshake: false,
		external,
		input: 'src/uwp.mjs',
		output: {
			file: `uwp.js`,
			format: 'umd',
			name: 'uwp-node',
			globals,
		}
	}, {
		//treeshake: false,
		external,
		input: 'src/node.mjs',
		output: {
			file: `node.js`,
			format: 'umd',
			name: 'uwp-node',
			globals,
		}
	}
]

function objectFromArray(arr) {
	var obj = {}
	arr.forEach(moduleName => obj[moduleName] = moduleName)
	return obj
}