/**
 * Visual Components — type definitions.
 *
 * Architecture source: Contribution #619 §2
 *
 * A VisualComponent (VC) is a user-authored reusable canvas tree.
 * Users build a "Card" once, drop it onto multiple pages, override props
 * per-instance, and the publisher emits each VC as src/components/{Name}.tsx.
 *
 * This is React's component model applied to canvas authoring.
 *
 * Constraint #269: This file must NOT import from editor/ or editor-store/.
 */

// ---------------------------------------------------------------------------
// VCParam — explicit prop surface for a Visual Component
// ---------------------------------------------------------------------------

/**
 * A named parameter on a Visual Component.
 * Params drive the publisher's TypeScript interface and per-instance overrides.
 * `id` is stable across renames — propBindings reference it by id, not name.
 */
export interface VCParam {
  /** Stable ID — generated with nanoid(); survives param renames */
  id: string
  /** camelCase, valid JS identifier, unique within the VC */
  name: string
  type: 'string' | 'number' | 'boolean' | 'url' | 'enum' | 'color'
  defaultValue: unknown
  required: boolean
  /** Only meaningful when type === 'enum' */
  enumOptions?: string[]
}

// ---------------------------------------------------------------------------
// PropBinding — binds a node prop inside a VC tree to a VCParam
// ---------------------------------------------------------------------------

/**
 * Binds a property on a node inside a VC tree to one of the VC's params.
 * Stored in PageNode.propBindings[propKey] = { paramId }.
 * Keyed by paramId (not name) so renames don't break existing bindings.
 */
export interface PropBinding {
  /** VCParam.id — stable reference that survives param renames */
  paramId: string
}

// ---------------------------------------------------------------------------
// VisualComponentRefProps — props for the base.visualComponentRef module
// ---------------------------------------------------------------------------

/**
 * Props for a Visual Component instance placed on a page or another VC.
 * `propOverrides` is the diff from the VC's param defaults.
 */
export interface VisualComponentRefProps extends Record<string, unknown> {
  /** VisualComponent.id being referenced */
  componentId: string
  /** Per-instance overrides diffed against VC param defaults */
  propOverrides: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// VisualComponent — top-level VC document stored in SiteDocument.visualComponents[]
// ---------------------------------------------------------------------------

/**
 * A reusable canvas tree authored by the end user.
 * Stored as a flat array in SiteDocument.visualComponents[] (parallel to pages[]).
 *
 * Naming invariants (enforced at write boundaries by validateComponentName()):
 *  - PascalCase, valid JS identifier
 *  - Not a reserved React/JS name
 *  - Not a base module display name
 *  - Unique within the site
 *
 * filePath is always derived: `src/components/${name}.tsx`
 * Updating `name` must atomically update `filePath` (slice responsibility).
 */
export interface VisualComponent {
  /** Unique ID — generated with nanoid() */
  id: string

  /**
   * PascalCase name — site-unique.
   * Validated by validateComponentName() at every write boundary.
   */
  name: string

  /**
   * Root node of the VC's canvas tree.
   * Uses the same PageNode shape as Page nodes.
   * Children are tracked via the standard `children: string[]` IDs AND via
   * `childNodes?: PageNode[]` for nested VC tree traversal.
   */
  rootNode: {
    id: string
    moduleId: string
    props: Record<string, unknown>
    children: string[]
    breakpointOverrides: Record<string, Partial<Record<string, unknown>>>
    childNodes?: Array<unknown>
    propBindings?: Record<string, PropBinding>
    label?: string
    locked?: boolean
    hidden?: boolean
    classIds?: string[]
  }

  /** Explicit prop surface — drives publisher TypeScript type + instance overrides */
  params: VCParam[]

  /** Per-VC breakpoints (mirrors SiteDocument.breakpoints) */
  breakpoints: Array<{id: string; label: string; width: number; icon: string}>

  /** Ordered class IDs from the site's class registry */
  classIds: string[]

  /**
   * Canonical file path — always `src/components/${name}.tsx`.
   * Derived from name; auto-corrected by validateSite on mismatch.
   * NEVER user-editable directly (rename VC to change path).
   */
  filePath: string

  /**
   * Publisher eject precedence (mirrors SiteFile):
   *   generated=true, ejected=false  → scaffold/canvas version re-emitted
   *   generated=true, ejected=true   → user's .tsx wins (manual override)
   *   generated=false                → always emit from canvas tree
   */
  generated: boolean
  ejected: boolean

  createdAt: number
}
