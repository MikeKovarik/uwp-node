import './node-stdio.mjs'
import {broker} from './node-broker.mjs'
import {isNode} from './util.mjs'
import createApp from './app.mjs'


var app = isNode ? createApp(broker) : undefined
export default app
export {broker}
