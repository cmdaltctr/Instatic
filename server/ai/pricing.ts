/**
 * Hard-coded price table for `(providerId, modelId)` → USD per million tokens.
 *
 * Maintained by hand from each provider's pricing page. Wrong prices are an
 * annoyance, not a correctness bug — the source of truth is the provider
 * invoice. Token counts are always stored regardless of whether a price entry
 * exists; if the entry is missing, `calculateCostUsd` returns 0.
 *
 * Cache pricing (Anthropic):
 *   - `cacheReadPer1MUsd`  — applied to cached input tokens on subsequent calls.
 *   - `cacheWritePer1MUsd` — applied to tokens written to the cache the first
 *                            time (premium over plain input).
 *   The runtime currently exposes a single `promptTokens` aggregate, so the
 *   cost path treats every prompt token at the standard input rate. Future
 *   work can split cached/non-cached counts onto separate fields in the
 *   `usage` event and use these here.
 *
 * Sources:
 *   - Anthropic:  https://www.anthropic.com/pricing
 *   - OpenAI:     https://openai.com/api/pricing
 *   - Ollama:     self-hosted, no per-call cost
 */

import type { AiProviderId } from './runtime/types'

export interface ModelPricing {
  providerId: AiProviderId
  modelId: string
  inputPer1MUsd: number
  outputPer1MUsd: number
  /** Anthropic-only — premium for the first call that populates the cache. */
  cacheWritePer1MUsd?: number
  /** Anthropic-only — discount for subsequent calls that hit the cache. */
  cacheReadPer1MUsd?: number
}

// Anthropic figures mirror the Sonnet/Opus/Haiku 4.x tier (May 2026).
// OpenAI figures mirror the GPT-5.4 / 5.5 release-day list price.
export const MODEL_PRICING: readonly ModelPricing[] = [
  // Anthropic
  { providerId: 'anthropic', modelId: 'claude-opus-4-7',  inputPer1MUsd: 15.0,  outputPer1MUsd: 75.0, cacheWritePer1MUsd: 18.75, cacheReadPer1MUsd: 1.50 },
  { providerId: 'anthropic', modelId: 'claude-opus-4-6',  inputPer1MUsd: 15.0,  outputPer1MUsd: 75.0, cacheWritePer1MUsd: 18.75, cacheReadPer1MUsd: 1.50 },
  { providerId: 'anthropic', modelId: 'claude-sonnet-4-6', inputPer1MUsd: 3.0,  outputPer1MUsd: 15.0, cacheWritePer1MUsd: 3.75, cacheReadPer1MUsd: 0.30 },
  { providerId: 'anthropic', modelId: 'claude-haiku-4-5',  inputPer1MUsd: 0.80, outputPer1MUsd: 4.0,  cacheWritePer1MUsd: 1.00, cacheReadPer1MUsd: 0.08 },

  // OpenAI
  { providerId: 'openai', modelId: 'gpt-5.5',       inputPer1MUsd: 5.0,  outputPer1MUsd: 25.0 },
  { providerId: 'openai', modelId: 'gpt-5.4',       inputPer1MUsd: 2.50, outputPer1MUsd: 10.0 },
  { providerId: 'openai', modelId: 'gpt-5.4-mini',  inputPer1MUsd: 0.15, outputPer1MUsd: 0.60 },
  { providerId: 'openai', modelId: 'gpt-5.4-nano',  inputPer1MUsd: 0.05, outputPer1MUsd: 0.20 },

  // Ollama — self-hosted, no per-call cost. Listed for completeness so the
  // lookup returns a defined entry (cost 0) rather than falling to the
  // unknown-model branch which logs a warning on first hit.
]

/**
 * Look up the price entry for `(providerId, modelId)` — returns null when the
 * pair isn't listed (a new model the table hasn't caught up to yet, or any
 * Ollama model). Callers either:
 *   - use `calculateCostUsd(...)` to fold the lookup + math in one call, OR
 *   - inspect the entry directly when they need per-tier disclosure (the AI
 *     audit UI uses this to colour-code unknown vs priced rows).
 */
export function lookupModelPricing(
  providerId: AiProviderId,
  modelId: string,
): ModelPricing | null {
  return MODEL_PRICING.find((p) => p.providerId === providerId && p.modelId === modelId) ?? null
}

/**
 * Compute USD cost for one usage event. Returns 0 when no pricing entry
 * exists for `(providerId, modelId)` — the caller still persists the token
 * counts so a future price-table update retroactively prices the call.
 *
 * Inputs are treated as raw input (no cache split). See the module-header
 * note on cache pricing — once `usage` events surface cached/non-cached
 * splits, refine this to apply `cacheReadPer1MUsd` to the cached subset.
 */
export function calculateCostUsd(
  providerId: AiProviderId,
  modelId: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const entry = lookupModelPricing(providerId, modelId)
  if (!entry) return 0
  const inputCost = (promptTokens / 1_000_000) * entry.inputPer1MUsd
  const outputCost = (completionTokens / 1_000_000) * entry.outputPer1MUsd
  return roundToCents(inputCost + outputCost)
}

/**
 * Round to the storage column's precision (numeric(10, 6)). Anything below
 * one micro-dollar truncates to 0 — fine for our cost-meter precision goal
 * (we report rolled-up totals at the cent or higher).
 */
function roundToCents(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}
