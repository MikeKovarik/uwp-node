require('../../node.js')
var ipcEnabled = !!process.send
console.log('i am child', ipcEnabled ? 'with IPC' : 'without IPC')