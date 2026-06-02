/**
 * PageNode — BaseNode plus an optional `dynamicBindings` map for CMS template
 * pages. Pages use a flat `nodes: Record<string, PageNode>` map (same as
 * `NodeTreeSchema.nodes`) — nodes are stored in a flat ID-keyed map.
 *
 * The `dynamicBindings` overlay is applied at render time when the page is
 * used as a CMS content template. Static props remain stored as fallback
 * values.
 *
 * Constraint #269: no imports from editor / editor-store here.
 */

import { Type, type Static } from '@core/utils/typeboxHelpers'
import { BaseNodeSchema, parsePropBindings } from './baseNode'
import { DynamicPropBindingSchema, parseDynamicBindings } from './dynamicBinding'
import {
  asPlainObject,
  onlyStrings,
  parseBreakpointStylesBag,
  parseStylesBag,
  requireArrayField,
  requireStringField,
} from './parseHelpers'

// ---------------------------------------------------------------------------
// PageNodeSchema
// ---------------------------------------------------------------------------

export const PageNodeSchema = Type.Object({
  ...BaseNodeSchema.properties,
  /**
   * Template-only prop bindings.
   * Static props remain stored as fallback values; dynamicBindings overlay them
   * at render time when a page is used as a CMS content template.
   * Silently dropped if invalid — handled in parsePageNode.
   */
  dynamicBindings: Type.Optional(Type.Record(Type.String(), DynamicPropBindingSchema)),
})

export type PageNode = Static<typeof PageNodeSchema>

// ---------------------------------------------------------------------------
// Tolerant parsing
// ---------------------------------------------------------------------------

/**
 * Parse a single PageNode, throwing `Error('<nodePath>.<field>: <message>')` on
 * required-field failures so parsePage/parseSiteDocument can report the exact
 * invalid path.
 *
 * Replicates the Zod `.catch()` fallback behaviour for `withFallback()` fields
 * (props, breakpointOverrides, classIds) so nodes missing these fields are
 * still accepted with sensible defaults rather than rejected.
 *
 * PageNode is a flat node (no recursive nesting). Pages use a flat
 * `nodes: Record<string, PageNode>` map, iterated directly in parsePage.
 */
export function parsePageNode(raw: unknown, nodePath: string): PageNode {
  const r = asPlainObject(raw)
  if (!r) throw new Error(`${nodePath}: not an object`)

  const id = requireStringField(r, 'id', nodePath)
  const moduleId = requireStringField(r, 'moduleId', nodePath)
  const rawChildren = requireArrayField(r, 'children', nodePath)

  const props = parseStylesBag(r.props)
  const propBindings = parsePropBindings(r.propBindings)
  const dynamicBindings = parseDynamicBindings(r.dynamicBindings)
  // Inline styles — same tolerant bag parser as props/class styles. Dropped
  // when missing or empty so nodes without inline styles stay lean.
  const inlineStyles = parseStylesBag(r.inlineStyles)

  return {
    id,
    moduleId,
    props,
    breakpointOverrides: parseBreakpointStylesBag(r.breakpointOverrides),
    children: onlyStrings(rawChildren),
    classIds: Array.isArray(r.classIds) ? onlyStrings(r.classIds) : [],
    ...(typeof r.label === 'string' ? { label: r.label } : {}),
    ...(typeof r.locked === 'boolean' ? { locked: r.locked } : {}),
    ...(typeof r.hidden === 'boolean' ? { hidden: r.hidden } : {}),
    ...(propBindings !== undefined ? { propBindings } : {}),
    ...(dynamicBindings !== undefined ? { dynamicBindings } : {}),
    ...(Object.keys(inlineStyles).length > 0 ? { inlineStyles } : {}),
  }
}
