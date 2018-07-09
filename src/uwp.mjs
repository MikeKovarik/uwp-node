import './uwp-process.mjs'
import {broker} from './uwp-broker.mjs'
import {isUwp} from './util.mjs'
import createApp from './app.mjs'


var app = isUwp ? createApp(broker) : undefined
export default app
export {broker}

export * from './uwp-cp-shim.mjs'
export {ChildProcess} from './uwp-ChildProcess.mjs'
