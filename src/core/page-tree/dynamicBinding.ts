/**
 * DynamicPropBinding — CMS template overlay for a node prop.
 *
 * Source semantics:
 * - `currentEntry` — top of the publisher's entry stack. Inside a `base.loop`
 *   subtree this is the iteration's item; outside any loop on a single-entry
 *   template page this is the entry being viewed.
 * - `parentEntry` — one frame below the top. Inside a loop nested in a
 *   single-entry template, this lets a node refer to the outer template
 *   entry (e.g. "Related to {parentEntry.title}").
 * - `page` — fields of the page being rendered (title, slug, permalink, …).
 *   Always present on every render — no loop or template needed.
 * - `site` — site-level fields (name, baseUrl, settings.*). Always present.
 * - `viewer` — fields of the currently authenticated user, or `null` for
 *   anonymous renders. Bindings resolve to empty when null.
 * - `route` — URL frame (path, slug, segments). Always present.
 *
 * Format tag controls how the resolved value is rendered (plain text, raw
 * HTML, URL, media path). Fallback strategy controls behaviour when the
 * binding resolves to empty.
 *
 * The `parseAndMigrateDynamicBindings` helper is the single place where
 * string-prop bindings are migrated in-place to inline `{source.field}` tokens
 * stored directly in the prop value. Non-string-valued props (number, boolean)
 * keep the structured binding form because tokens cannot carry non-string
 * values.
 *
 * Constraint #269: no imports from editor / editor-store here.
 */

import { Type, type Static } from '@core/utils/typeboxHelpers'
import { asPlainObject } from './parseHelpers'

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const DynamicBindingSourceSchema = Type.Union([
  Type.Literal('currentEntry'),
  Type.Literal('parentEntry'),
  Type.Literal('page'),
  Type.Literal('site'),
  Type.Literal('viewer'),
  Type.Literal('route'),
])
type DynamicBindingSource = Static<typeof DynamicBindingSourceSchema>

const DynamicBindingFormatSchema = Type.Union([
  Type.Literal('plain'),
  Type.Literal('html'),
  Type.Literal('url'),
  Type.Literal('media'),
])
type DynamicBindingFormat = Static<typeof DynamicBindingFormatSchema>

export const DynamicPropBindingSchema = Type.Object({
  source: DynamicBindingSourceSchema,
  field: Type.String({ minLength: 1 }),
  /** Valid format tag; silently dropped if unrecognised or absent — handled in parseDynamicPropBinding. */
  format: Type.Optional(DynamicBindingFormatSchema),
  /** Fallback strategy; silently dropped if unrecognised or absent — handled in parseDynamicPropBinding. */
  fallback: Type.Optional(Type.Union([Type.Literal('static'), Type.Literal('empty')])),
})

export type DynamicPropBinding = Static<typeof DynamicPropBindingSchema>

// ---------------------------------------------------------------------------
// Tolerant parsing
// ---------------------------------------------------------------------------

/** Parse a DynamicPropBinding, silently dropping unrecognised format/fallback values. */
export function parseDynamicPropBinding(raw: unknown): DynamicPropBinding | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const VALID_SOURCES: DynamicBindingSource[] = [
    'currentEntry',
    'parentEntry',
    'page',
    'site',
    'viewer',
    'route',
  ]
  if (!VALID_SOURCES.includes(r.source as DynamicBindingSource)) return null
  if (typeof r.field !== 'string' || r.field.length === 0) return null

  const VALID_FORMATS: DynamicBindingFormat[] = ['plain', 'html', 'url', 'media']
  const format: DynamicBindingFormat | undefined = VALID_FORMATS.includes(r.format as DynamicBindingFormat)
    ? (r.format as DynamicBindingFormat)
    : undefined

  const VALID_FALLBACKS = ['static', 'empty'] as const
  type Fallback = typeof VALID_FALLBACKS[number]
  const fallback: Fallback | undefined = (VALID_FALLBACKS as readonly unknown[]).includes(r.fallback)
    ? (r.fallback as Fallback)
    : undefined

  return {
    source: r.source as DynamicBindingSource,
    field: r.field,
    ...(format !== undefined ? { format } : {}),
    ...(fallback !== undefined ? { fallback } : {}),
  }
}

/**
 * Parse a raw dynamicBindings map. Invalid entries are silently dropped
 * (per-entry tolerance). For entries whose target prop currently holds a
 * string value (or is unset), the binding is migrated in-place to a
 * `{source.field}` token in the prop value and the binding entry is dropped.
 * Non-string-valued props (number, boolean) keep the structured binding form
 * because tokens cannot carry non-string values.
 *
 * Returns the surviving structured bindings, or `undefined` when none remain.
 * `props` is mutated in place — that is the source-of-truth migration.
 */
export function parseAndMigrateDynamicBindings(
  raw: unknown,
  props: Record<string, unknown>,
): Record<string, DynamicPropBinding> | undefined {
  const outer = asPlainObject(raw)
  if (!outer) return undefined

  const result: Record<string, DynamicPropBinding> = {}
  for (const [propKey, entry] of Object.entries(outer)) {
    const binding = parseDynamicPropBinding(entry)
    if (!binding) continue

    // Migrate string-prop bindings to inline tokens. The prop value becomes
    // `{source.field}`; if the prop was unset, we still seed it as a string
    // so token interpolation has something to walk.
    const target = props[propKey]
    if (typeof target === 'string' || target === undefined) {
      props[propKey] = `{${binding.source}.${binding.field}}`
      continue
    }
    result[propKey] = binding
  }
  return Object.keys(result).length > 0 ? result : undefined
}
