/**
 * PageTemplateConfig — optional CMS template configuration on a Page.
 *
 * When present, the page is rendered once per matching CMS entry from the
 * referenced `tableSlug`. `priority` and `conditions` select which entries
 * the template applies to when multiple templates compete.
 *
 * Constraint #269: no imports from editor / editor-store here.
 */

import { Type, Value, type Static } from '@core/utils/typeboxHelpers'

// ---------------------------------------------------------------------------
// Internal sub-schemas
// ---------------------------------------------------------------------------

const TemplateContextSchema = Type.Literal('entry')

const TemplateConditionSchema = Type.Object({
  id: Type.String(),
  field: Type.String(),
  operator: Type.Literal('equals'),
  value: Type.String(),
})

type TemplateCondition = Static<typeof TemplateConditionSchema>

// ---------------------------------------------------------------------------
// PageTemplateConfigSchema
// ---------------------------------------------------------------------------

export const PageTemplateConfigSchema = Type.Object({
  enabled: Type.Literal(true),
  context: TemplateContextSchema,
  tableSlug: Type.String({ minLength: 1 }),
  /**
   * Falls back to 0 when missing or not a finite number —
   * handled in parsePageTemplate.
   */
  priority: Type.Number(),
  /** Invalid items are silently dropped; missing array becomes [] — handled in parsePageTemplate. */
  conditions: Type.Array(TemplateConditionSchema),
})

export type PageTemplateConfig = Static<typeof PageTemplateConfigSchema>

// ---------------------------------------------------------------------------
// Tolerant parsing
// ---------------------------------------------------------------------------

/** Parse a PageTemplateConfig, providing fallbacks for priority and conditions. */
export function parsePageTemplate(raw: unknown): PageTemplateConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (r.enabled !== true) return null
  if (r.context !== 'entry') return null
  if (typeof r.tableSlug !== 'string' || r.tableSlug.length === 0) return null

  const priority = typeof r.priority === 'number' && isFinite(r.priority) ? r.priority : 0
  const conditions = Array.isArray(r.conditions)
    ? r.conditions.flatMap((c) => Value.Check(TemplateConditionSchema, c) ? [c as TemplateCondition] : [])
    : []

  return { enabled: true, context: 'entry', tableSlug: r.tableSlug as string, priority, conditions }
}
