/**
 * Shared tool-execution body for the direct provider HTTP drivers.
 *
 * Both execution modes funnel through here:
 *   - `server`  — call the tool's `handler(input, ctx)` directly, in-process.
 *   - `browser` — forward to the browser via `bridge.callBrowser(...)` and
 *                 await the POST-back from /admin/api/ai/tool-result.
 *
 * Defence in depth: every raw tool input is re-validated against the
 * canonical TypeBox `inputSchema` before dispatch — the model's argument JSON
 * is untrusted no matter which provider produced it.
 */

import { parseValue } from '@core/utils/typeboxHelpers'
import type {
  AiBrowserBridge,
  AiTool,
  AiToolOutput,
  ToolContext,
} from '../../runtime/types'
import type { ToolContextBase } from '../types'

/**
 * Execute one tool call and return the canonical `AiToolOutput`. Never throws —
 * validation, handler, and bridge failures all collapse to `{ ok: false, error }`
 * so the loop can feed the failure back to the model and let it recover.
 */
export async function executeAiTool(
  aiTool: AiTool,
  rawInput: unknown,
  bridge: AiBrowserBridge,
  signal: AbortSignal,
  toolContextBase: ToolContextBase,
): Promise<AiToolOutput> {
  let validated: unknown
  try {
    validated = parseValue(aiTool.inputSchema, rawInput)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid tool input.'
    return { ok: false, error: message }
  }

  if (aiTool.execution === 'server') {
    if (!aiTool.handler) {
      return { ok: false, error: `Tool ${aiTool.name} declares execution='server' but has no handler.` }
    }
    try {
      const ctx: ToolContext = { ...toolContextBase, signal }
      const result = await aiTool.handler(validated, ctx)
      return normaliseToolOutput(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : `Tool ${aiTool.name} failed.`
      return { ok: false, error: message }
    }
  }

  // Browser execution: forward to the bridge and wait for the POST-back.
  try {
    return await bridge.callBrowser(aiTool.name, validated)
  } catch (err) {
    const message = err instanceof Error ? err.message : `Tool ${aiTool.name} failed.`
    return { ok: false, error: message }
  }
}

/**
 * Server-side handlers return their own raw payload. Wrap it in the canonical
 * `AiToolOutput` envelope so the model always sees a consistent `{ ok, data }`
 * shape, whether the tool ran server-side or in the browser.
 */
function normaliseToolOutput(result: unknown): AiToolOutput {
  if (result && typeof result === 'object' && 'ok' in result) {
    return result as AiToolOutput
  }
  return { ok: true, data: result }
}
