/**
 * Public entrypoint for the site-editor agent module.
 *
 * Everything outside this folder imports the agent layer through this barrel;
 * files inside the folder import from each other via relative paths. Keep new
 * cross-module surface area routed through here rather than deep-importing
 * individual files.
 */

// Slice factory + its public contract.
export { createAgentSlice } from './agentSlice'
export type { AgentSlice, AgentSliceConfig } from './agentSlice'

// Site-editor wiring (scope, snapshot, dispatcher) handed to the factory.
export { siteAgentSliceConfig } from './agentSliceConfig.site'

// Stream protocol — schema + per-event reducer.
export { processStreamEvent, ServerStreamEventSchema } from './streamEvents'

// Site-specific page snapshot builders.
export { buildPageContext, buildCurrentPageContext } from './pageContext'
export { buildPageSnapshot } from './pageSnapshot'
export type { PageSnapshotOptions } from './pageSnapshot'

// Browser-side tool dispatch + render evidence + markdown rendering.
export { executeAgentTool } from './executor'
export { captureAgentRenderSnapshot } from './renderEvidence'
export { renderMarkdownToHtml } from './markdown'

// Store handle wiring.
export { setAgentStoreApi, getAgentStoreApi } from './storeRef'
export type { AgentStoreApi } from './storeRef'

// Shared message/wire/context types and network path constants.
export * from './types'
export * from './agentConfig'
