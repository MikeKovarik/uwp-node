var fs = require('fs').promises
var path = require('path')
var MsBuild = require('msbuild')


var modulePath = process.cwd()
if (modulePath.endsWith('test'))
	modulePath = path.dirname(modulePath)
var brokerDir = path.join(modulePath, 'broker-process')
var testerDir = path.join(modulePath, 'broker-tester')
var testerProj = path.join(modulePath, 'broker-tester/broker-tester.csproj')
var testerExe = path.join(modulePath,  'broker-tester/bin/Debug/broker-tester.exe')

module.exports.testerExe = testerExe

// Reads contents of broker folder, filters only .cs files, looks at their modification times
// and checks if any of them has been modified after the tester exe was compiled.
async function checkStaleness() {
	try {
		var exeTime = (await fs.stat(testerExe)).mtimeMs
		//return await checkFolderStaleness(brokerDir, exeTime)
		return false
			|| await checkFolderStaleness(testerDir, exeTime)
	} catch(err) {
		return true
	}
}

async function checkFolderStaleness(dirPath, exeTime) {
	var statPromises = (await fs.readdir(dirPath))
		.filter(name => name.endsWith('.cs'))
		.map(name => fs.stat(path.join(dirPath, name)))
	return (await Promise.all(statPromises))
		.map(stat => stat.mtimeMs)
		.map(mtime => mtime > exeTime)
		.includes(true)
}

async function build(projPath) {
	return new Promise(resolve => {
		var msbuild = new MsBuild(resolve)
		// hack, because the msbuild doesn't seem to work with new VS/MSBuild version
		msbuild.buildexe = () => 'C:\\Program Files (x86)\\Microsoft Visual Studio\\2017\\Community\\MSBuild\\15.0\\Bin\\MSBuild.exe'
		msbuild.sourcePath = projPath
		msbuild.build()
	})
}

module.exports.compileIfNeeded = async function() {
	var shouldRecompile = await checkStaleness()
	if (shouldRecompile) {
		console.log('Recompiling tester.')
		await build(testerProj)
	} else {
		console.log('No need to recompile tester.')
	}
}
