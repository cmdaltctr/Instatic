/**
 * BaseNode — shared structural base for both page-flat-map nodes (PageNode)
 * and Visual Component tree nodes (VCNode).
 *
 * Lives in its own module (rather than inside `page-tree/types.ts`) so that
 * `visualComponents/schemas.ts` can import this base without pulling in the
 * full Site / page-tree type graph — which would create the cycle
 * `page-tree/types ↔ visualComponents/{types,schemas}`.
 *
 * Constraint #269: no imports from editor / editor-store here.
 */

import { Type, Value, type Static, withFallback } from '@core/utils/typeboxHelpers'

// ---------------------------------------------------------------------------
// PropBinding — used by both BaseNode (propBindings field) and VCNodeSchema
// ---------------------------------------------------------------------------

/** Maps prop key → { paramId } for render-time VC parameter substitution. */
const PropBindingSchema = Type.Object({ paramId: Type.String() })

// ---------------------------------------------------------------------------
// BaseNodeSchema — shared structural schema for PageNode and VCNode
//
// `PageNodeSchema` (in `./schemas`) extends this with an optional
// `dynamicBindings` field for template data-binding on page-level nodes.
//
// `VCNodeSchema` (in `src/core/visualComponents/schemas.ts`) is a direct
// re-export of this schema — VCNode === BaseNode. VC trees use the same flat
// `children: string[]` flat-ID map as Page trees.
//
// The shared base eliminates `as unknown as PageNode` / `as unknown as VCNode`
// casts when tree-walking functions need to operate on nodes from either context.
// ---------------------------------------------------------------------------

export const BaseNodeSchema = Type.Object({
  // Unique ID — generated with nanoid()
  id: Type.String(),

  // References a ModuleDefinition in the registry.
  // Format: "namespace.module-name" — e.g. "base.text"
  moduleId: Type.String(),

  // Resolved property values for this node's module.
  // Shape validated against ModuleDefinition.schema at runtime.
  // Keys are FLAT — no dot-path nesting.
  props: withFallback(Type.Record(Type.String(), Type.Unknown()), {}),

  // Per-breakpoint prop overrides — shallow-merged on top of props when
  // rendering at a given breakpoint. Key is Breakpoint.id.
  breakpointOverrides: withFallback(
    Type.Record(Type.String(), Type.Record(Type.String(), Type.Unknown())),
    {},
  ),

  // Ordered array of child node IDs.
  // Only meaningful when ModuleDefinition.canHaveChildren === true.
  // All children are in a single default slot (multi-slot deferred post-MVP).
  // Strict (no fallback): non-array children throw SiteValidationError at load
  // time (mirrors validatePageNode assertArray behaviour — Constraint #230).
  children: Type.Array(Type.String()),

  // Optional user-facing label — overrides the module name in the DOM tree panel
  label: Type.Optional(Type.String()),

  // When true, cannot be selected or moved in the editor
  locked: Type.Optional(Type.Boolean()),

  // When true, hidden on the canvas (still present in the tree)
  hidden: Type.Optional(Type.Boolean()),

  // Ordered class IDs from the site's class registry.
  // Applied as the referenced user-facing class names on the element.
  // Later classes in the array win in cascade order.
  // Empty array when no classes are applied.
  classIds: withFallback(Type.Array(Type.String()), []),

  // Prop bindings for render-time parameter substitution.
  // Maps prop key → { paramId } (stable VCParam.id reference).
  // When present, the renderer substitutes instanceProps[param.name] for
  // the bound prop key at render time (Contribution #619 §4 Option β).
  // Optional — absent on all standard Page nodes and unbound VC nodes.
  //
  // Per-entry lenience: use parsePropBindings() when parsing raw node data —
  // it filters invalid entries rather than failing the whole field. The
  // schema here reflects the validated type; the helper does the filtering.
  propBindings: Type.Optional(Type.Record(Type.String(), PropBindingSchema)),
})

export type BaseNode = Static<typeof BaseNodeSchema>

// ---------------------------------------------------------------------------
// parsePropBindings — sibling helper for per-entry-lenient propBindings parsing
//
// Replaces the Zod `.catch({}).transform((map) => {...}).optional()` chain.
// Call this when parsing raw node data (page-tree and VC node deserialization)
// to silently drop entries that don't match PropBindingSchema, rather than
// failing the whole field.
// ---------------------------------------------------------------------------

/**
 * Parse and filter a raw propBindings map. Invalid entries are silently
 * dropped; returns `undefined` when no valid entries remain.
 *
 * Use this at the raw-data parsing layer (page-tree/pageNode and
 * visualComponents/schemas) instead of relying on schema-level transforms.
 */
export function parsePropBindings(
  raw: unknown,
): Record<string, { paramId: string }> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const out: Record<string, { paramId: string }> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (Value.Check(PropBindingSchema, v)) {
      out[k] = v
    }
  }
  return Object.keys(out).length > 0 ? out : undefined
}
