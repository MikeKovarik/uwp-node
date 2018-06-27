import uwpApp from './uwp.mjs'
import nodeApp from './node.mjs'

export default uwpApp || nodeApp

export * from './uwp.mjs'
export * from './node.mjs'