import uwpApp, {broker as uwpBroker} from './uwp.mjs'
import nodeApp, {broker as nodeBroker} from './node.mjs'

export default uwpApp || nodeApp
export var broker = uwpBroker || nodeBroker

export * from './util.mjs'

export * from './uwp.mjs'
export * from './node.mjs'