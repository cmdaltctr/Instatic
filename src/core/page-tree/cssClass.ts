/**
 * CSSClass — a named, reusable CSS class that can be assigned to any node.
 *
 * §4.1 persistence note: `styles` and `breakpointStyles` are stored as
 * `Record<string, unknown>` matching `validate.ts` line 822 which stores the
 * raw object without narrowing to CSSPropertyBag. Narrowing happens at the
 * publisher boundary (`bagToCSS` in `classCss.ts`).
 *
 * CSSPropertyBag is used for the WRITE API (classSlice / framework
 * generators) which always writes only known CSS property keys.
 *
 * For tolerant parsing of persisted classes (with per-entry fallbacks),
 * use `parseCSSClass` instead of `parseValue(CSSClassSchema, raw)`.
 *
 * Constraint #269: no imports from editor / editor-store here.
 */

import { Type, Value, type Static, withFallback } from '@core/utils/typeboxHelpers'
import { GeneratedClassMetadataSchema } from '@core/framework/schemas'
import {
  asPlainObject,
  parseBreakpointStylesBag,
  parseStringArrayField,
  parseStylesBag,
  parseTimestamp,
} from './parseHelpers'

// ---------------------------------------------------------------------------
// CSSClassSchema
// ---------------------------------------------------------------------------

export const CSSClassSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  description: Type.Optional(Type.String()),
  /**
   * Optional ownership scope. If the scope object does not match the exact
   * shape, it is silently dropped — handled in parseCSSClass.
   */
  scope: Type.Optional(Type.Object({
    type: Type.Literal('node'),
    nodeId: Type.String(),
    role: Type.Literal('module-style'),
  })),
  /**
   * Base CSS styles — arbitrary string→unknown map at persistence boundary.
   * Falls back to {} when missing or invalid — handled in parseCSSClass.
   */
  styles: withFallback(Type.Record(Type.String(), Type.Unknown()), {} as Record<string, unknown>),
  /**
   * Per-breakpoint overrides — same persistence semantics as `styles`.
   * Falls back to {} when missing or invalid — handled in parseCSSClass.
   */
  breakpointStyles: withFallback(
    Type.Record(Type.String(), Type.Record(Type.String(), Type.Unknown())),
    {} as Record<string, Record<string, unknown>>,
  ),
  /** Optional search/filter tags. Invalid items silently dropped — handled in parseCSSClass. */
  tags: Type.Optional(Type.Array(Type.String())),
  /** Metadata for framework-generated classes. Undefined if invalid — handled in parseCSSClass. */
  generated: Type.Optional(GeneratedClassMetadataSchema),
  createdAt: Type.Number(),
  updatedAt: Type.Number(),
})

export type CSSClass = Static<typeof CSSClassSchema>

// ---------------------------------------------------------------------------
// Tolerant parsing
// ---------------------------------------------------------------------------

/** Parse a CSSClass scope (currently only `{ type: 'node', nodeId, role: 'module-style' }`). */
function parseCSSClassScope(raw: unknown): CSSClass['scope'] {
  const s = asPlainObject(raw)
  if (!s) return undefined
  if (s.type !== 'node' || typeof s.nodeId !== 'string' || s.role !== 'module-style') return undefined
  return { type: 'node', nodeId: s.nodeId, role: 'module-style' }
}

/** Parse a CSSClass, providing fallbacks for resilient fields. */
export function parseCSSClass(raw: unknown): CSSClass | null {
  const r = asPlainObject(raw)
  if (!r) return null
  if (typeof r.id !== 'string') return null
  if (typeof r.name !== 'string') return null

  const scope = parseCSSClassScope(r.scope)
  const tags = parseStringArrayField(r.tags)
  const generated = Value.Check(GeneratedClassMetadataSchema, r.generated)
    ? (r.generated as CSSClass['generated'])
    : undefined

  return {
    id: r.id,
    name: r.name,
    ...(typeof r.description === 'string' ? { description: r.description } : {}),
    ...(scope !== undefined ? { scope } : {}),
    styles: parseStylesBag(r.styles),
    breakpointStyles: parseBreakpointStylesBag(r.breakpointStyles),
    ...(tags !== undefined ? { tags } : {}),
    ...(generated !== undefined ? { generated } : {}),
    createdAt: parseTimestamp(r.createdAt),
    updatedAt: parseTimestamp(r.updatedAt),
  }
}

/** Parse the class registry: iterate entries and silently drop those with invalid id/name. */
export function parseClassRegistry(raw: unknown): Record<string, CSSClass> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const result: Record<string, CSSClass> = {}
  for (const [id, cls] of Object.entries(raw as Record<string, unknown>)) {
    const parsed = parseCSSClass(cls)
    if (parsed) result[id] = parsed
  }
  return result
}
