/**
 * Provider-agnostic multi-turn tool loop for the direct HTTP drivers.
 *
 * Owns the agentic loop that the provider SDKs used to own:
 *
 *   1. Map the canonical `AiMessage[]` history into the provider's native
 *      message array (`adapter.mapHistory`).
 *   2. POST `{ ...body, stream: true }` and parse the SSE response into
 *      canonical `AiStreamEvent`s via a per-turn `TurnTranslator`.
 *   3. When the turn ends with tool calls, execute each (server handler or
 *      browser bridge) via `executeAiTool`, append the assistant `tool_use`
 *      turn + the `tool_result` turn to the working message array, and
 *      re-POST.
 *   4. Loop until the provider signals no more tool calls, then emit one
 *      aggregated `usage` event.
 *
 * Each provider supplies the small `ProviderAdapter` of pure functions; the
 * loop, SSE plumbing, tool dispatch, abort handling, and usage aggregation
 * live here once.
 *
 * Abort: `req.signal` is passed straight to `fetch`. On abort (or an
 * `AbortError` mid-stream) the generator returns cleanly with no `error`
 * event — matching the prior SDK behaviour.
 */

import type {
  AiStreamEvent,
  AiTool,
  AiToolOutput,
} from '../../runtime/types'
import type { AiStreamRequest } from '../types'
import { parseSseStream, type SseFrame } from './sse'
import { executeAiTool } from './execTool'
import { isAbortError, classifyHttpError } from './errors'

/** A resolved tool call the model issued this turn. */
export interface TurnToolCall {
  readonly id: string
  readonly name: string
  readonly input: unknown
}

/** The result of executing one tool, paired back with its call. */
export interface TurnToolResult {
  readonly id: string
  readonly name: string
  readonly output: AiToolOutput
}

/** Per-turn token usage reported by the provider. */
export interface TurnUsage {
  readonly promptTokens: number
  readonly completionTokens: number
  readonly cacheReadTokens?: number
  readonly cacheCreationTokens?: number
  /** Native USD cost, when the provider reports it (OpenRouter). */
  readonly costUsd?: number
}

/** What a finished turn yields to the loop. */
export interface TurnResult<TMessage> {
  /** True when the model is done (no tool calls / a non-tool stop reason). */
  readonly stop: boolean
  /** Tool calls to execute before the next turn. Empty when `stop`. */
  readonly toolCalls: TurnToolCall[]
  /**
   * The provider-native assistant turn to append before the tool results.
   * Null when there is nothing to append (e.g. a stop turn).
   */
  readonly assistantMessage: TMessage | null
  /** Token usage for this single API call, if reported. */
  readonly usage: TurnUsage | null
}

/**
 * Stateful translator for ONE API call. The loop feeds it every SSE frame via
 * `translate` (which yields wire events), then calls `finish` once the stream
 * ends to collect the assistant turn, tool calls, usage, and stop signal.
 */
export interface TurnTranslator<TMessage> {
  translate(frame: SseFrame): AiStreamEvent[]
  finish(): TurnResult<TMessage>
}

/** The per-provider plumbing the loop needs. `TMessage` is the provider's native message shape. */
export interface ProviderAdapter<TMessage> {
  readonly label: string
  readonly endpoint: string
  buildHeaders(req: AiStreamRequest): Record<string, string>
  /** Canonical `AiMessage[]` history → provider-native message array. */
  mapHistory(req: AiStreamRequest): TMessage[]
  /** Provider-native messages → the full JSON request body (sets `stream: true`). */
  buildRequestBody(messages: TMessage[], req: AiStreamRequest): unknown
  /** Build the tool-result turn appended after the assistant turn. */
  buildToolResultMessage(results: TurnToolResult[]): TMessage
  /** Fresh translator for each API call in the loop. */
  createTurnTranslator(): TurnTranslator<TMessage>
}

/**
 * Drive the multi-turn loop for one provider. Yields canonical
 * `AiStreamEvent`s; the runner forwards them to the wire + DB.
 */
export async function* runToolLoop<TMessage>(
  adapter: ProviderAdapter<TMessage>,
  req: AiStreamRequest,
): AsyncIterable<AiStreamEvent> {
  const toolsByName = new Map<string, AiTool>(req.tools.map((t) => [t.name, t]))
  const messages = adapter.mapHistory(req)
  const headers = adapter.buildHeaders(req)

  // Usage is reported per API call; aggregate across the whole loop so the
  // runner persists a single total (and prices it via pricing.ts when the
  // provider omits costUsd).
  let promptTokens = 0
  let completionTokens = 0
  let cacheReadTokens = 0
  let cacheCreationTokens = 0
  let costUsd: number | undefined

  for (;;) {
    if (req.signal.aborted) return

    let res: Response
    try {
      res = await fetch(adapter.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(adapter.buildRequestBody(messages, req)),
        signal: req.signal,
      })
    } catch (err) {
      if (isAbortError(err) || req.signal.aborted) return
      const detail = err instanceof Error ? err.message : String(err)
      console.error(`[ai/${adapter.label.toLowerCase()}] request failed:`, err)
      yield { type: 'error', message: `${adapter.label} request failed: ${detail}` }
      return
    }

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '')
      console.error(`[ai/${adapter.label.toLowerCase()}] HTTP ${res.status}:`, bodyText.slice(0, 500))
      yield { type: 'error', message: classifyHttpError(adapter.label, res.status, bodyText) }
      return
    }

    const translator = adapter.createTurnTranslator()
    try {
      for await (const frame of parseSseStream(res)) {
        for (const event of translator.translate(frame)) {
          yield event
          if (event.type === 'error') return
        }
      }
    } catch (err) {
      if (isAbortError(err) || req.signal.aborted) return
      const detail = err instanceof Error ? err.message : String(err)
      console.error(`[ai/${adapter.label.toLowerCase()}] stream error:`, err)
      yield { type: 'error', message: `${adapter.label} stream error: ${detail}` }
      return
    }

    if (req.signal.aborted) return

    const turn = translator.finish()
    if (turn.usage) {
      promptTokens += turn.usage.promptTokens
      completionTokens += turn.usage.completionTokens
      cacheReadTokens += turn.usage.cacheReadTokens ?? 0
      cacheCreationTokens += turn.usage.cacheCreationTokens ?? 0
      if (turn.usage.costUsd != null) costUsd = (costUsd ?? 0) + turn.usage.costUsd
    }

    if (turn.stop || turn.toolCalls.length === 0) {
      break
    }

    if (turn.assistantMessage !== null) {
      messages.push(turn.assistantMessage)
    }

    // Execute every tool the model requested this turn, then append the
    // combined tool-result turn before re-POSTing.
    const results: TurnToolResult[] = []
    for (const call of turn.toolCalls) {
      const tool = toolsByName.get(call.name)
      const output: AiToolOutput = tool
        ? await executeAiTool(tool, call.input, req.bridge, req.signal, req.toolContextBase)
        : { ok: false, error: `Unknown tool: ${call.name}` }
      yield {
        type: 'toolResult',
        toolCallId: call.id,
        toolName: call.name,
        ok: output.ok,
        error: output.ok ? undefined : output.error ?? 'Tool call failed.',
      }
      results.push({ id: call.id, name: call.name, output })
      if (req.signal.aborted) return
    }

    messages.push(adapter.buildToolResultMessage(results))
  }

  yield {
    type: 'usage',
    promptTokens,
    completionTokens,
    costUsd,
    cacheReadTokens: cacheReadTokens || undefined,
    cacheCreationTokens: cacheCreationTokens || undefined,
  }
}
