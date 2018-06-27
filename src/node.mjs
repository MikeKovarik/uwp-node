import './node-stdio.mjs'
import {broker} from './node-broker.mjs'
import {isNode} from './util.mjs'
import createApp from './app.mjs'


var app = isNode ? createApp(broker) : undefined
export default app

// NODE NEEDS TO BE ABLE TO
// - open uwp (because of systray)
// - close uwp
// NODE NEEDS TO RECEIVE
// - uwp app closed
// - uwp app opened
// this is hanled by uwp-node by hidden custom IPC channel
/*
bgIpc.on('message' => {
	// app closed OR app opened
	// else 
	// bg task detached
	// else
	// bg task reattached
})
bgIpc.on('error', () => {
	// bg task closed
})
*/