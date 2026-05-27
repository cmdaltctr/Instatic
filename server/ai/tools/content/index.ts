/**
 * Content-scope tool barrel — exports the toolset, system-prompt builder,
 * and snapshot type.
 *
 * The chat handler imports `contentTools` for `scope === 'content'` and
 * `buildContentSystemPrompt` when assembling the prompt for a content-scope
 * conversation.
 */

import type { AiTool } from '../types'
import { contentReadTools } from './readTools'
import { contentWriteTools } from './writeTools'

export const contentTools: AiTool[] = [
  ...contentReadTools,
  ...contentWriteTools,
]

export { buildContentSystemPrompt } from './systemPrompt'
export type { ContentSnapshot } from './snapshot'
