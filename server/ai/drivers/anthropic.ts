/**
 * Anthropic driver — direct HTTP against the Messages API.
 *
 * Talks to `POST https://api.anthropic.com/v1/messages` with no SDK: the
 * shared `http/` layer owns SSE parsing, the multi-turn tool loop, tool
 * execution, and error classification; this file owns the Anthropic-specific
 * mapping — request body, `AiMessage[] → messages[]`, and the SSE→AiStreamEvent
 * translator.
 *
 * Prompt caching is GA (no beta header): the static system prefix carries
 * `cache_control: { type: 'ephemeral' }` so follow-up turns hit the cache.
 *
 * Tools are sent with their canonical TypeBox `inputSchema` as `input_schema`
 * directly — TypeBox schemas ARE JSON Schema, so there is no Zod bridge.
 */

import { Type, parseValue, type Static } from '@core/utils/typeboxHelpers'
import type {
  AiAuthMode,
  AiContentBlock,
  AiMessage,
  AiProviderId,
  AiStreamEvent,
} from '../runtime/types'
import type {
  AiProvider,
  AiProviderModel,
  AiStreamRequest,
} from './types'
import { runToolLoop, type ProviderAdapter, type TurnResult, type TurnToolCall, type TurnToolResult, type TurnTranslator, type TurnUsage } from './http/toolLoop'
import type { SseFrame } from './http/sse'

const SUPPORTED_AUTH_MODES: AiAuthMode[] = ['apiKey']

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
const SYSTEM_PROMPT_DYNAMIC_BOUNDARY = '__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__'

// Per-turn output cap. Anthropic requires `max_tokens`; the prior SDK left it
// to its own default. 8192 comfortably covers a single agent turn (a few
// insertHtml chunks + a short narration) without risking truncation; multi-turn
// work continues across loop iterations, not within one response.
const MAX_OUTPUT_TOKENS = 8192

// Static model list — current as of May 2026. Updating this in lockstep with
// provider releases is a known maintenance cost; the alternative (hitting
// `client.models.list` on every model-picker open) is too slow. Same
// maintenance pattern as `server/ai/pricing.ts`.
//
// Sources:
//   - https://platform.claude.com/docs/en/about-claude/models/overview
//   - https://github.com/anthropics/skills/blob/main/skills/claude-api/shared/models.md
const MODELS: AiProviderModel[] = [
  {
    id: 'claude-opus-4-7',
    label: 'Claude Opus 4.7',
    tier: 'smartest',
    capabilities: { toolCalling: true, visionInput: true, promptCache: true, streaming: true },
  },
  {
    id: 'claude-opus-4-6',
    label: 'Claude Opus 4.6',
    tier: 'smart',
    capabilities: { toolCalling: true, visionInput: true, promptCache: true, streaming: true },
  },
  {
    id: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    tier: 'balanced',
    capabilities: { toolCalling: true, visionInput: true, promptCache: true, streaming: true },
  },
  {
    id: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    tier: 'fast',
    capabilities: { toolCalling: true, visionInput: true, promptCache: true, streaming: true },
  },
]

export const anthropicDriver: AiProvider = {
  id: 'anthropic' as AiProviderId,
  label: 'Anthropic',
  supportedAuthModes: SUPPORTED_AUTH_MODES,

  capabilities(modelId: string) {
    const model = MODELS.find((m) => m.id === modelId)
    return model?.capabilities ?? {
      toolCalling: true,
      visionInput: false,
      promptCache: true,
      streaming: true,
    }
  },

  async listModels(_creds) {
    // Static list for v1 — see the comment on MODELS above.
    return MODELS
  },

  async *stream(req: AiStreamRequest): AsyncIterable<AiStreamEvent> {
    if (req.credentials.authMode !== 'apiKey' || !req.credentials.apiKey) {
      // Defensive: a non-apiKey credential reaching the driver implies a
      // mismatched DB row or a bypassed UI. Fail cleanly instead of POSTing
      // and getting a generic 401.
      yield {
        type: 'error',
        message:
          'Anthropic requires an API key. Add an API-key credential in /admin/ai/providers and pick it for the site default.',
      }
      return
    }
    yield* runToolLoop(anthropicAdapter, req)
  },
}

// ---------------------------------------------------------------------------
// Provider-native message shapes (request side — we construct, never parse)
// ---------------------------------------------------------------------------

interface AnthropicTextBlock {
  type: 'text'
  text: string
  cache_control?: { type: 'ephemeral' }
}
interface AnthropicImageBlock {
  type: 'image'
  source: { type: 'base64'; media_type: string; data: string }
}
interface AnthropicToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: unknown
}
interface AnthropicToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  content: string
  is_error?: boolean
}
type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicImageBlock
  | AnthropicToolUseBlock
  | AnthropicToolResultBlock

export interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: AnthropicContentBlock[]
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

const anthropicAdapter: ProviderAdapter<AnthropicMessage> = {
  label: 'Anthropic',
  endpoint: ANTHROPIC_ENDPOINT,

  buildHeaders(req) {
    return {
      'x-api-key': req.credentials.apiKey!,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    }
  },

  mapHistory(req) {
    return mapHistory(req.messages)
  },

  buildRequestBody(messages, req) {
    const body: Record<string, unknown> = {
      model: req.modelId,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: buildSystemBlocks(req.systemPrompt),
      messages,
      stream: true,
    }
    if (req.tools.length > 0) {
      body.tools = req.tools.map((t) => ({
        name: t.name,
        description: t.description,
        // The TypeBox schema IS JSON Schema — pass it straight through.
        input_schema: t.inputSchema,
      }))
    }
    return body
  },

  buildToolResultMessage(results) {
    return buildToolResultMessage(results)
  },

  createTurnTranslator() {
    return new AnthropicTurnTranslator()
  },
}

// ---------------------------------------------------------------------------
// System prompt → system blocks
// ---------------------------------------------------------------------------

/**
 * Map the canonical `systemPrompt` array into Anthropic's `system` field.
 *
 *   - 3-element `[prefix, BOUNDARY, suffix]` → two text blocks, `cache_control`
 *     on the static prefix so it's served from the prompt cache on later turns.
 *   - 1-element `[text]` → the plain string (no caching).
 *   - any other length → joined into one uncached block (defensive).
 */
export function buildSystemBlocks(systemPrompt: string[]): string | AnthropicTextBlock[] {
  if (systemPrompt.length === 3 && systemPrompt[1] === SYSTEM_PROMPT_DYNAMIC_BOUNDARY) {
    return [
      { type: 'text', text: systemPrompt[0]!, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: systemPrompt[2]! },
    ]
  }
  if (systemPrompt.length === 1) {
    return systemPrompt[0]!
  }
  return systemPrompt.filter((s) => s !== SYSTEM_PROMPT_DYNAMIC_BOUNDARY).join('\n\n')
}

// ---------------------------------------------------------------------------
// AiMessage[] → Anthropic messages[]
// ---------------------------------------------------------------------------

/**
 * Map the canonical conversation log into Anthropic's `messages` array.
 *
 * Anthropic requires strictly alternating user/assistant turns and pairs each
 * assistant `tool_use` block with a following `{ role:'user', content:[tool_result] }`
 * turn. The persisted log stores each tool call + result as separate rows, so
 * we coalesce consecutive assistant rows into one assistant turn and consecutive
 * `role:'tool'` rows into one user turn of `tool_result` blocks.
 */
export function mapHistory(messages: AiMessage[]): AnthropicMessage[] {
  const out: AnthropicMessage[] = []
  let i = 0
  while (i < messages.length) {
    const msg = messages[i]!
    if (msg.role === 'user') {
      out.push({ role: 'user', content: userContent(msg.content) })
      i += 1
    } else if (msg.role === 'assistant') {
      const content: AnthropicContentBlock[] = []
      while (i < messages.length && messages[i]!.role === 'assistant') {
        content.push(...assistantContent((messages[i] as Extract<AiMessage, { role: 'assistant' }>).content))
        i += 1
      }
      out.push({ role: 'assistant', content })
    } else if (msg.role === 'tool') {
      const content: AnthropicContentBlock[] = []
      while (i < messages.length && messages[i]!.role === 'tool') {
        content.push(toolResultBlock(messages[i] as Extract<AiMessage, { role: 'tool' }>))
        i += 1
      }
      out.push({ role: 'user', content })
    } else {
      // role:'system' never appears in `messages` (system is its own field).
      i += 1
    }
  }
  return out
}

function userContent(blocks: AiContentBlock[]): AnthropicContentBlock[] {
  const out: AnthropicContentBlock[] = []
  for (const block of blocks) {
    if (block.kind === 'text') out.push({ type: 'text', text: block.text })
    else if (block.kind === 'image') {
      out.push({ type: 'image', source: { type: 'base64', media_type: block.mimeType, data: block.data } })
    }
    // user-authored toolCall blocks don't exist; ignore defensively.
  }
  return out
}

function assistantContent(blocks: AiContentBlock[]): AnthropicContentBlock[] {
  const out: AnthropicContentBlock[] = []
  for (const block of blocks) {
    if (block.kind === 'text') {
      if (block.text) out.push({ type: 'text', text: block.text })
    } else if (block.kind === 'toolCall') {
      out.push({ type: 'tool_use', id: block.toolCallId, name: block.toolName, input: block.input ?? {} })
    }
    // assistant image blocks don't occur; ignore.
  }
  return out
}

function toolResultBlock(msg: Extract<AiMessage, { role: 'tool' }>): AnthropicToolResultBlock {
  return {
    type: 'tool_result',
    tool_use_id: msg.toolCallId,
    content: toolOutputToContent(msg.output),
    is_error: msg.output.ok ? undefined : true,
  }
}

function buildToolResultMessage(results: TurnToolResult[]): AnthropicMessage {
  return {
    role: 'user',
    content: results.map((r) => ({
      type: 'tool_result' as const,
      tool_use_id: r.id,
      content: toolOutputToContent(r.output),
      is_error: r.output.ok ? undefined : true,
    })),
  }
}

function toolOutputToContent(output: { ok: boolean; data?: unknown; error?: string }): string {
  if (output.ok) return JSON.stringify(output.data ?? { ok: true })
  return output.error ?? 'Tool call failed.'
}

// ---------------------------------------------------------------------------
// SSE event schema (boundary validation — no `as` on parsed JSON)
// ---------------------------------------------------------------------------

const AnthropicUsageSchema = Type.Object(
  {
    input_tokens: Type.Optional(Type.Number()),
    output_tokens: Type.Optional(Type.Number()),
    cache_read_input_tokens: Type.Optional(Type.Number()),
    cache_creation_input_tokens: Type.Optional(Type.Number()),
  },
  { additionalProperties: true },
)

const AnthropicSseEventSchema = Type.Object(
  {
    type: Type.String(),
    index: Type.Optional(Type.Number()),
    content_block: Type.Optional(
      Type.Object(
        {
          type: Type.Optional(Type.String()),
          id: Type.Optional(Type.String()),
          name: Type.Optional(Type.String()),
          input: Type.Optional(Type.Unknown()),
        },
        { additionalProperties: true },
      ),
    ),
    delta: Type.Optional(
      Type.Object(
        {
          type: Type.Optional(Type.String()),
          text: Type.Optional(Type.String()),
          partial_json: Type.Optional(Type.String()),
          stop_reason: Type.Optional(Type.Union([Type.String(), Type.Null()])),
        },
        { additionalProperties: true },
      ),
    ),
    message: Type.Optional(
      Type.Object(
        { usage: Type.Optional(AnthropicUsageSchema) },
        { additionalProperties: true },
      ),
    ),
    usage: Type.Optional(AnthropicUsageSchema),
    error: Type.Optional(
      Type.Object(
        { type: Type.Optional(Type.String()), message: Type.Optional(Type.String()) },
        { additionalProperties: true },
      ),
    ),
  },
  { additionalProperties: true },
)

// ---------------------------------------------------------------------------
// SSE translator — one per API call in the loop
// ---------------------------------------------------------------------------

interface MutableUsage {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

export class AnthropicTurnTranslator implements TurnTranslator<AnthropicMessage> {
  // Block order as it streams, so the assistant turn rebuilds text/tool_use
  // blocks in the sequence the model emitted them.
  private readonly order: number[] = []
  private readonly textByIndex = new Map<number, string>()
  private readonly toolByIndex = new Map<number, { id: string; name: string; json: string }>()
  private readonly toolCalls: TurnToolCall[] = []
  private usage: MutableUsage = {}
  private stopReason: string | null = null

  translate(frame: SseFrame): AiStreamEvent[] {
    let event: Static<typeof AnthropicSseEventSchema>
    try {
      event = parseValue(AnthropicSseEventSchema, JSON.parse(frame.data))
    } catch {
      // A frame we can't parse (keep-alive comment, malformed payload) is not
      // fatal — skip it.
      return []
    }

    switch (event.type) {
      case 'message_start':
        if (event.message?.usage) this.mergeUsage(event.message.usage)
        return []

      case 'content_block_start': {
        const index = event.index ?? 0
        const block = event.content_block
        if (block?.type === 'tool_use') {
          this.order.push(index)
          this.toolByIndex.set(index, {
            id: typeof block.id === 'string' ? block.id : `tool-${index}`,
            name: typeof block.name === 'string' ? block.name : 'tool',
            json: '',
          })
        } else if (block?.type === 'text') {
          this.order.push(index)
          this.textByIndex.set(index, '')
        }
        return []
      }

      case 'content_block_delta': {
        const index = event.index ?? 0
        const delta = event.delta
        if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
          this.textByIndex.set(index, (this.textByIndex.get(index) ?? '') + delta.text)
          return [{ type: 'text', text: delta.text }]
        }
        if (delta?.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
          const tool = this.toolByIndex.get(index)
          if (tool) tool.json += delta.partial_json
        }
        return []
      }

      case 'content_block_stop': {
        const index = event.index ?? 0
        const tool = this.toolByIndex.get(index)
        if (!tool) return []
        const input = parseJsonOrEmpty(tool.json)
        this.toolCalls.push({ id: tool.id, name: tool.name, input })
        return [{
          type: 'toolCall',
          toolCallId: tool.id,
          toolName: tool.name,
          input,
          status: 'pending',
        }]
      }

      case 'message_delta': {
        if (typeof event.delta?.stop_reason === 'string') this.stopReason = event.delta.stop_reason
        if (event.usage) this.mergeUsage(event.usage)
        return []
      }

      case 'error': {
        const detail = event.error?.message
        return [{
          type: 'error',
          message: detail
            ? `Anthropic error: ${detail}`
            : 'Anthropic stream failed. Check your credentials in /admin/ai/providers.',
        }]
      }

      // message_stop, ping, and unrecognised events carry nothing we surface.
      default:
        return []
    }
  }

  finish(): TurnResult<AnthropicMessage> {
    const content: AnthropicContentBlock[] = []
    for (const index of this.order) {
      const text = this.textByIndex.get(index)
      if (text !== undefined) {
        if (text) content.push({ type: 'text', text })
        continue
      }
      const tool = this.toolByIndex.get(index)
      if (tool) {
        content.push({ type: 'tool_use', id: tool.id, name: tool.name, input: parseJsonOrEmpty(tool.json) })
      }
    }

    return {
      stop: this.stopReason !== 'tool_use',
      toolCalls: this.toolCalls,
      assistantMessage: content.length > 0 ? { role: 'assistant', content } : null,
      usage: this.toTurnUsage(),
    }
  }

  private mergeUsage(usage: MutableUsage): void {
    // input/cache fields land on message_start; output_tokens is cumulative on
    // message_delta — last-wins captures the final values correctly.
    for (const key of ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'] as const) {
      const value = usage[key]
      if (typeof value === 'number') this.usage[key] = value
    }
  }

  private toTurnUsage(): TurnUsage {
    return {
      promptTokens: this.usage.input_tokens ?? 0,
      completionTokens: this.usage.output_tokens ?? 0,
      cacheReadTokens: this.usage.cache_read_input_tokens ?? 0,
      cacheCreationTokens: this.usage.cache_creation_input_tokens ?? 0,
    }
  }
}

function parseJsonOrEmpty(value: string): unknown {
  if (!value.trim()) return {}
  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
}
