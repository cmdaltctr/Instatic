/**
 * Task #436 — Visual Components Data Layer
 *
 * WHY THESE GATES EXIST
 * ─────────────────────
 * Architecture source: Contribution #619 §2–§6, §9, §10
 *
 * Task #436 implements the first of three VC implementation tasks. It delivers
 * the pure data layer that Tasks #437 (Canvas Integration) and #438 (Publisher
 * Emission) build on:
 *
 *   src/core/visualComponents/types.ts             — VisualComponent, VCParam, PropBinding
 *   src/core/visualComponents/nameValidation.ts    — validateComponentName (5 error codes)
 *   src/core/visualComponents/recursionGuard.ts    — getReferencedComponentIds + wouldCreateCycle
 *   src/core/editor-store/slices/visualComponentsSlice.ts — CRUD slice (mirrors filesSlice)
 *   src/core/page-tree/types.ts (extension)        — PageNode.propBindings optional field
 *   src/core/page-tree/types.ts (extension)        — SiteDocument.visualComponents: VisualComponent[]
 *   src/core/persistence/validate.ts (extension)   — validateSite lenient-per-item VC handling
 *
 * ── Gate groups ──────────────────────────────────────────────────────────────
 *
 * Section 1 — File existence (FE-1 – FE-4)
 * Section 2 — Dependency direction (DD-1 – DD-2)
 * Section 3 — Type shape / static source scan (TS-1 – TS-4)
 * Section 4 — nameValidation: one gate per NameError code (NV-1 – NV-9)
 * Section 5 — recursionGuard pure functions (RG-1 – RG-8)
 * Section 6 — visualComponentsSlice CRUD via store (SL-1 – SL-14)
 * Section 7 — validateSite extension (VP-1 – VP-7)
 *
 * Total: ~52 gates (most pre-failing until Task #436 is implemented)
 *
 * Both flags from Test Engineer review #1894 are directly addressed here:
 *  Flag #1: §3 recursion guard is at slice write boundary → RG-4 to RG-8
 *  Flag #2: §6 name validation per error code → NV-1 to NV-9
 *
 * @see Contribution #619 §2 — data model
 * @see Contribution #619 §3 — recursion guard spec
 * @see Contribution #619 §6 — name validation spec
 * @see Contribution #619 §9 — validateSite extension
 * @see src/core/files/pathValidation.ts — pattern template (isSafePath)
 * @see src/core/editor-store/slices/filesSlice.ts — pattern template (CRUD slice)
 * @see Task #436 — VC Data Layer
 */

import { describe, it, expect, beforeEach } from 'bun:test'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { useEditorStore } from '../../core/editor-store/store'
import { validateSite } from '../../core/persistence/validate'
import type { SiteDocument } from '../../core/page-tree/types'

// ---------------------------------------------------------------------------
// Canonical paths
// ---------------------------------------------------------------------------

const ROOT = join(import.meta.dir, '../../../')

const TYPES_TS         = join(ROOT, 'src/core/visualComponents/types.ts')
const NAME_VALIDATION  = join(ROOT, 'src/core/visualComponents/nameValidation.ts')
const RECURSION_GUARD  = join(ROOT, 'src/core/visualComponents/recursionGuard.ts')
const VC_SLICE_TS      = join(ROOT, 'src/core/editor-store/slices/visualComponentsSlice.ts')
const PAGE_TREE_TYPES  = join(ROOT, 'src/core/page-tree/types.ts')

// ---------------------------------------------------------------------------
// Lazy-loaded functional modules (fail gracefully if not yet implemented)
// ---------------------------------------------------------------------------

let validateComponentName: (
  name: string,
  existing: Array<{ id: string; name: string }>,
  selfId?: string
) => { ok: true } | { ok: false; error: string; reason: string }

let getReferencedComponentIds: (node: unknown) => Set<string>
let wouldCreateCycle: (
  visualComponents: unknown[],
  hostVcId: string,
  candidateChildVcId: string
) => boolean

try {
   
  const nvMod = require('../../core/visualComponents/nameValidation')
  validateComponentName = nvMod.validateComponentName
} catch {
  validateComponentName = undefined as unknown as typeof validateComponentName
}

try {
   
  const rgMod = require('../../core/visualComponents/recursionGuard')
  getReferencedComponentIds = rgMod.getReferencedComponentIds
  wouldCreateCycle          = rgMod.wouldCreateCycle
} catch {
  getReferencedComponentIds = undefined as unknown as typeof getReferencedComponentIds
  wouldCreateCycle          = undefined as unknown as typeof wouldCreateCycle
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireNV(fn: typeof validateComponentName) {
  if (!fn) {
    throw new Error(
      '[Task #436 not implemented] validateComponentName is not exported from\n' +
      '  src/core/visualComponents/nameValidation.ts\n\n' +
      'Implement the module and export validateComponentName to make this gate green.',
    )
  }
}

function requireRG(fn: unknown) {
  if (!fn) {
    throw new Error(
      '[Task #436 not implemented] recursionGuard function not found in\n' +
      '  src/core/visualComponents/recursionGuard.ts\n\n' +
      'Implement and export getReferencedComponentIds + wouldCreateCycle.',
    )
  }
}

/** Store helpers — mirrors filesDataLayer.test.ts pattern */
function freshStore() {
  useEditorStore.setState({
    site: null,
    _historyPast: [],
    _historyFuture: [],
    canUndo: false,
    canRedo: false,
    selectedNodeId: null,
    hoveredNodeId: null,
    hasUnsavedChanges: false,
  })
  return useEditorStore.getState()
}

function setupSite() {
  const s = freshStore()
  s.createSite('VC Test SiteDocument')
  return useEditorStore.getState()
}

function requireSliceAction(actionName: string): void {
  const state = useEditorStore.getState() as Record<string, unknown>
  if (typeof state[actionName] !== 'function') {
    throw new Error(
      `[Task #436 not implemented] useEditorStore.getState().${actionName} is not a function.\n\n` +
      'Add visualComponentsSlice to the store to make this gate green.',
    )
  }
}

/** Minimal base-site fixture for validateSite tests */
function rawSite(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'proj-vc',
    name: 'VC SiteDocument',
    createdAt: 1000,
    updatedAt: 2000,
    files: [],
    classes: {},
    breakpoints: [{ id: 'desktop', label: 'Desktop', width: 1440, icon: 'monitor' }],
    settings: {
      colorTokens: {},
      typeScale: { baseSize: 16, ratio: 1.25 },
      shortcuts: {},
    },
    pages: [
      {
        id: 'page-1',
        title: 'Home',
        slug: 'index',
        rootNodeId: 'root',
        nodes: {
          root: { id: 'root', moduleId: 'base.root', props: {}, children: [], breakpointOverrides: {} },
        },
      },
    ],
    ...overrides,
  }
}

/** Minimal valid VC shape for validateSite tests */
function rawVC(overrides: Record<string, unknown> = {}) {
  return {
    id: 'vc-card-1',
    name: 'Card',
    rootNode: { id: 'vc-root', moduleId: 'base.container', props: {}, children: [], breakpointOverrides: {} },
    params: [],
    breakpoints: [],
    classIds: [],
    filePath: 'src/components/Card.tsx',
    generated: true,
    ejected: false,
    createdAt: 1000,
    ...overrides,
  }
}

// ============================================================================
// Section 1 — File existence
// ============================================================================

describe('Gate FE-1 — types.ts exists', () => {
  it('src/core/visualComponents/types.ts exists', () => {
    expect(existsSync(TYPES_TS)).toBe(true)
  })
})

describe('Gate FE-2 — nameValidation.ts exists', () => {
  it('src/core/visualComponents/nameValidation.ts exists', () => {
    expect(existsSync(NAME_VALIDATION)).toBe(true)
  })
})

describe('Gate FE-3 — recursionGuard.ts exists', () => {
  it('src/core/visualComponents/recursionGuard.ts exists', () => {
    expect(existsSync(RECURSION_GUARD)).toBe(true)
  })
})

describe('Gate FE-4 — visualComponentsSlice.ts exists', () => {
  it('src/core/editor-store/slices/visualComponentsSlice.ts exists', () => {
    expect(existsSync(VC_SLICE_TS)).toBe(true)
  })
})

// ============================================================================
// Section 2 — Dependency direction
// ============================================================================

describe('Gate DD-1 — core/visualComponents has no editor/ imports', () => {
  it('types.ts, nameValidation.ts, recursionGuard.ts do NOT import from editor/', () => {
    // All files in the visualComponents directory must stay in core —
    // editor/ → core/ is allowed, core/ → editor/ is not.
    const files = [TYPES_TS, NAME_VALIDATION, RECURSION_GUARD]
    for (const file of files) {
      if (!existsSync(file)) continue  // File not yet created — will fail via FE-* gate
      const source = readFileSync(file, 'utf8')
      const editorImports = source.match(/from ['"][^'"]*editor\/[^'"]*['"]/g) ?? []
      expect(editorImports).toHaveLength(0)
    }
  })
})

describe('Gate DD-2 — visualComponentsSlice has no editor/ imports', () => {
  it('visualComponentsSlice.ts does NOT import from editor/', () => {
    if (!existsSync(VC_SLICE_TS)) {
      throw new Error('[Task #436 not implemented] visualComponentsSlice.ts does not exist yet.')
    }
    const source = readFileSync(VC_SLICE_TS, 'utf8')
    const editorImports = source.match(/from ['"][^'"]*editor\/[^'"]*['"]/g) ?? []
    expect(editorImports).toHaveLength(0)
  })
})

// ============================================================================
// Section 3 — Type shape (static source scan on page-tree/types.ts)
// ============================================================================

describe('Gate TS-1 — SiteDocument.visualComponents field declared in types.ts', () => {
  it('page-tree/types.ts declares visualComponents: VisualComponent[]', () => {
    const source = readFileSync(PAGE_TREE_TYPES, 'utf8')
    // Must contain a visualComponents field declaration
    expect(source).toMatch(/visualComponents\s*:\s*VisualComponent\[\]/)
  })
})

describe('Gate TS-2 — PageNode.propBindings optional field declared', () => {
  it('page-tree/types.ts adds optional propBindings to PageNode', () => {
    const source = readFileSync(PAGE_TREE_TYPES, 'utf8')
    // Optional propBindings field — must be declared inside the PageNode interface
    expect(source).toMatch(/propBindings\s*\?/)
  })
})

describe('Gate TS-3 — VCParam shape has stable id field', () => {
  it('types.ts exports VCParam with id, name, type, defaultValue', () => {
    if (!existsSync(TYPES_TS)) {
      throw new Error('[Task #436 not implemented] types.ts does not exist yet.')
    }
    const source = readFileSync(TYPES_TS, 'utf8')
    // id is the stable identifier that survives param renames (§2 rationale)
    expect(source).toMatch(/interface VCParam/)
    expect(source).toMatch(/\bid\s*:\s*string/)
    expect(source).toMatch(/\bname\s*:\s*string/)
    expect(source).toMatch(/\btype\s*:\s*['"]string['"]/)
    expect(source).toMatch(/\bdefaultValue\s*:/)
  })
})

describe('Gate TS-4 — VisualComponent shape has required fields', () => {
  it('types.ts exports VisualComponent with id, name, rootNode, params, filePath, generated, ejected', () => {
    if (!existsSync(TYPES_TS)) {
      throw new Error('[Task #436 not implemented] types.ts does not exist yet.')
    }
    const source = readFileSync(TYPES_TS, 'utf8')
    expect(source).toMatch(/interface VisualComponent/)
    expect(source).toMatch(/\brootNode\s*:/)
    expect(source).toMatch(/\bparams\s*:.*VCParam/)
    expect(source).toMatch(/\bfilePath\s*:\s*string/)
    expect(source).toMatch(/\bgenerated\s*:\s*boolean/)
    expect(source).toMatch(/\bejected\s*:\s*boolean/)
  })
})

// ============================================================================
// Section 4 — nameValidation: one gate per NameError code
// ============================================================================

describe('Gate NV-1 — EMPTY: empty string rejected', () => {
  it('validateComponentName("", []) returns {ok:false, error:"EMPTY"}', () => {
    requireNV(validateComponentName)
    const result = validateComponentName('', [])
    expect(result.ok).toBe(false)
    expect((result as { error: string }).error).toBe('EMPTY')
  })
})

describe('Gate NV-2 — NOT_PASCAL_CASE: lowercase-starting name rejected', () => {
  it('validateComponentName("card", []) returns {ok:false, error:"NOT_PASCAL_CASE"}', () => {
    requireNV(validateComponentName)
    const result = validateComponentName('card', [])
    expect(result.ok).toBe(false)
    expect((result as { error: string }).error).toBe('NOT_PASCAL_CASE')
  })
})

describe('Gate NV-3 — NOT_PASCAL_CASE: digit-starting name rejected', () => {
  it('validateComponentName("123Card", []) returns {ok:false, error:"NOT_PASCAL_CASE"}', () => {
    requireNV(validateComponentName)
    const result = validateComponentName('123Card', [])
    expect(result.ok).toBe(false)
    expect((result as { error: string }).error).toBe('NOT_PASCAL_CASE')
  })
})

describe('Gate NV-4 — RESERVED_WORD: React reserved names rejected', () => {
  it('validateComponentName("Fragment", []) returns {ok:false, error:"RESERVED_WORD"}', () => {
    requireNV(validateComponentName)
    const result = validateComponentName('Fragment', [])
    expect(result.ok).toBe(false)
    expect((result as { error: string }).error).toBe('RESERVED_WORD')
  })
})

describe('Gate NV-5 — BASE_MODULE_COLLISION: base module display names rejected', () => {
  it('validateComponentName("Button", []) returns {ok:false, error:"BASE_MODULE_COLLISION"}', () => {
    // "Button" is a canonical base module (Context #338)
    requireNV(validateComponentName)
    const result = validateComponentName('Button', [])
    expect(result.ok).toBe(false)
    expect((result as { error: string }).error).toBe('BASE_MODULE_COLLISION')
  })
})

describe('Gate NV-6 — PROJECT_DUPLICATE: duplicate name in same site rejected', () => {
  it('validateComponentName("Card", [{id:"vc-1", name:"Card"}]) returns {ok:false, error:"PROJECT_DUPLICATE"}', () => {
    requireNV(validateComponentName)
    const existing = [{ id: 'vc-1', name: 'Card' }]
    const result = validateComponentName('Card', existing)
    expect(result.ok).toBe(false)
    expect((result as { error: string }).error).toBe('PROJECT_DUPLICATE')
  })
})

describe('Gate NV-7 — valid PascalCase name accepted', () => {
  it('validateComponentName("Card", []) returns {ok:true}', () => {
    requireNV(validateComponentName)
    const result = validateComponentName('Card', [])
    expect(result.ok).toBe(true)
  })
})

describe('Gate NV-8 — valid multi-word PascalCase accepted', () => {
  it('validateComponentName("MyButton", []) returns {ok:true}', () => {
    requireNV(validateComponentName)
    const result = validateComponentName('MyButton', [])
    expect(result.ok).toBe(true)
  })
})

describe('Gate NV-9 — selfId skip: renaming to own existing name is allowed', () => {
  it('validateComponentName("Card", [{id:"vc-1", name:"Card"}], "vc-1") returns {ok:true}', () => {
    requireNV(validateComponentName)
    const existing = [{ id: 'vc-1', name: 'Card' }]
    // selfId matches vc-1 — should NOT trigger PROJECT_DUPLICATE
    const result = validateComponentName('Card', existing, 'vc-1')
    expect(result.ok).toBe(true)
  })
})

// ============================================================================
// Section 5 — recursionGuard pure functions
// ============================================================================

describe('Gate RG-1 — getReferencedComponentIds: leaf node returns empty set', () => {
  it('a node with no children and moduleId !== base.visualComponentRef returns empty set', () => {
    requireRG(getReferencedComponentIds)
    const leafNode = {
      id: 'n1',
      moduleId: 'base.heading',
      props: { text: 'Hello' },
      children: [],
      breakpointOverrides: {},
    }
    const ids = getReferencedComponentIds(leafNode)
    expect(ids.size).toBe(0)
  })
})

describe('Gate RG-2 — getReferencedComponentIds: direct componentRef found', () => {
  it('a node with moduleId=base.visualComponentRef returns its componentId', () => {
    requireRG(getReferencedComponentIds)
    const refNode = {
      id: 'n1',
      moduleId: 'base.visualComponentRef',
      props: { componentId: 'vc-banner-1', propOverrides: {} },
      children: [],
      breakpointOverrides: {},
    }
    const ids = getReferencedComponentIds(refNode)
    expect(ids.has('vc-banner-1')).toBe(true)
  })
})

describe('Gate RG-3 — getReferencedComponentIds: nested componentRef discovered', () => {
  it('a componentRef nested inside a container is still found via tree walk', () => {
    requireRG(getReferencedComponentIds)
    const containerNode = {
      id: 'container',
      moduleId: 'base.container',
      props: {},
      children: ['ref-child'],
      breakpointOverrides: {},
      childNodes: [
        {
          id: 'ref-child',
          moduleId: 'base.visualComponentRef',
          props: { componentId: 'vc-card-1', propOverrides: {} },
          children: [],
          breakpointOverrides: {},
        },
      ],
    }
    const ids = getReferencedComponentIds(containerNode)
    expect(ids.has('vc-card-1')).toBe(true)
  })
})

describe('Gate RG-4 — wouldCreateCycle: returns false when no cycle', () => {
  it('adding Banner inside Card (no cross-reference) → no cycle', () => {
    requireRG(wouldCreateCycle)
    const vcs = [
      { id: 'vc-card', name: 'Card', rootNode: { id: 'root', moduleId: 'base.container', props: {}, children: [], breakpointOverrides: {} }, params: [], breakpoints: [], classIds: [], filePath: 'src/components/Card.tsx', generated: true, ejected: false, createdAt: 1000 },
      { id: 'vc-banner', name: 'Banner', rootNode: { id: 'root', moduleId: 'base.container', props: {}, children: [], breakpointOverrides: {} }, params: [], breakpoints: [], classIds: [], filePath: 'src/components/Banner.tsx', generated: true, ejected: false, createdAt: 1000 },
    ]
    const result = wouldCreateCycle(vcs, 'vc-card', 'vc-banner')
    expect(result).toBe(false)
  })
})

describe('Gate RG-5 — wouldCreateCycle: detects self-cycle', () => {
  it('adding Card inside Card → cycle detected', () => {
    requireRG(wouldCreateCycle)
    const vcs = [
      { id: 'vc-card', name: 'Card', rootNode: { id: 'root', moduleId: 'base.container', props: {}, children: [], breakpointOverrides: {} }, params: [], breakpoints: [], classIds: [], filePath: 'src/components/Card.tsx', generated: true, ejected: false, createdAt: 1000 },
    ]
    const result = wouldCreateCycle(vcs, 'vc-card', 'vc-card')
    expect(result).toBe(true)
  })
})

describe('Gate RG-6 — wouldCreateCycle: detects 2-step cycle', () => {
  it('A contains B; trying to add A inside B → cycle detected', () => {
    requireRG(wouldCreateCycle)
    // Banner's rootNode already contains a visualComponentRef to Card
    const bannerRoot = {
      id: 'banner-root',
      moduleId: 'base.container',
      props: {},
      children: ['card-ref'],
      breakpointOverrides: {},
      childNodes: [
        {
          id: 'card-ref',
          moduleId: 'base.visualComponentRef',
          props: { componentId: 'vc-card', propOverrides: {} },
          children: [],
          breakpointOverrides: {},
        },
      ],
    }
    const vcs = [
      { id: 'vc-card', name: 'Card', rootNode: { id: 'root', moduleId: 'base.container', props: {}, children: [], breakpointOverrides: {} }, params: [], breakpoints: [], classIds: [], filePath: 'src/components/Card.tsx', generated: true, ejected: false, createdAt: 1000 },
      { id: 'vc-banner', name: 'Banner', rootNode: bannerRoot, params: [], breakpoints: [], classIds: [], filePath: 'src/components/Banner.tsx', generated: true, ejected: false, createdAt: 1000 },
    ]
    // Card tries to embed Banner — Banner already contains Card → cycle
    const result = wouldCreateCycle(vcs, 'vc-card', 'vc-banner')
    expect(result).toBe(true)
  })
})

describe('Gate RG-7 — wouldCreateCycle: detects 3-step cycle', () => {
  it('A→B→C; trying to add A inside C → cycle detected', () => {
    requireRG(wouldCreateCycle)
    // C contains B, B contains A. Trying to add A inside C would create A→B→C→A
    const cRoot = {
      id: 'c-root',
      moduleId: 'base.container',
      props: {},
      children: ['b-ref'],
      breakpointOverrides: {},
      childNodes: [
        {
          id: 'b-ref',
          moduleId: 'base.visualComponentRef',
          props: { componentId: 'vc-b', propOverrides: {} },
          children: [],
          breakpointOverrides: {},
        },
      ],
    }
    const bRoot = {
      id: 'b-root',
      moduleId: 'base.container',
      props: {},
      children: ['a-ref'],
      breakpointOverrides: {},
      childNodes: [
        {
          id: 'a-ref',
          moduleId: 'base.visualComponentRef',
          props: { componentId: 'vc-a', propOverrides: {} },
          children: [],
          breakpointOverrides: {},
        },
      ],
    }
    const vcs = [
      { id: 'vc-a', name: 'Alpha', rootNode: { id: 'root', moduleId: 'base.container', props: {}, children: [], breakpointOverrides: {} }, params: [], breakpoints: [], classIds: [], filePath: 'src/components/Alpha.tsx', generated: true, ejected: false, createdAt: 1000 },
      { id: 'vc-b', name: 'Beta', rootNode: bRoot, params: [], breakpoints: [], classIds: [], filePath: 'src/components/Beta.tsx', generated: true, ejected: false, createdAt: 1000 },
      { id: 'vc-c', name: 'Gamma', rootNode: cRoot, params: [], breakpoints: [], classIds: [], filePath: 'src/components/Gamma.tsx', generated: true, ejected: false, createdAt: 1000 },
    ]
    // vc-c tries to embed vc-a; vc-c already reaches vc-a via vc-b → cycle
    const result = wouldCreateCycle(vcs, 'vc-c', 'vc-a')
    expect(result).toBe(true)
  })
})

describe('Gate RG-8 — wouldCreateCycle: handles unknown candidate id gracefully', () => {
  it('candidate vc not in the array → returns false (no crash)', () => {
    requireRG(wouldCreateCycle)
    const vcs = [
      { id: 'vc-card', name: 'Card', rootNode: { id: 'root', moduleId: 'base.container', props: {}, children: [], breakpointOverrides: {} }, params: [], breakpoints: [], classIds: [], filePath: 'src/components/Card.tsx', generated: true, ejected: false, createdAt: 1000 },
    ]
    // candidate doesn't exist — should not throw, just return false
    expect(() => wouldCreateCycle(vcs, 'vc-card', 'vc-nonexistent')).not.toThrow()
    const result = wouldCreateCycle(vcs, 'vc-card', 'vc-nonexistent')
    expect(result).toBe(false)
  })
})

// ============================================================================
// Section 6 — visualComponentsSlice CRUD (via useEditorStore)
// ============================================================================

describe('Gate SL-1 — createVisualComponent: adds vc to site.visualComponents', () => {
  beforeEach(() => { setupSite() })

  it('createVisualComponent adds a VC and returns its id', () => {
    requireSliceAction('createVisualComponent')
    const s = useEditorStore.getState() as Record<string, unknown>
    const id = (s.createVisualComponent as (name: string) => string)('Card')
    const site = useEditorStore.getState().site!
    const vcs = (site as unknown as { visualComponents: Array<{ id: string }> }).visualComponents
    expect(vcs).toBeDefined()
    expect(vcs.some((vc) => vc.id === id)).toBe(true)
  })
})

describe('Gate SL-2 — createVisualComponent: sets name and derives filePath', () => {
  beforeEach(() => { setupSite() })

  it('created VC has correct name and derived filePath = src/components/{Name}.tsx', () => {
    requireSliceAction('createVisualComponent')
    const s = useEditorStore.getState() as Record<string, unknown>
    const id = (s.createVisualComponent as (name: string) => string)('FeatureRow')
    const vcs = (useEditorStore.getState().site as unknown as { visualComponents: Array<{ id: string; name: string; filePath: string }> }).visualComponents
    const vc = vcs.find((v) => v.id === id)!
    expect(vc.name).toBe('FeatureRow')
    expect(vc.filePath).toBe('src/components/FeatureRow.tsx')
  })
})

describe('Gate SL-3 — createVisualComponent: throws on EMPTY name', () => {
  beforeEach(() => { setupSite() })

  it('createVisualComponent("") throws VisualComponentNameError', () => {
    requireSliceAction('createVisualComponent')
    const s = useEditorStore.getState() as Record<string, unknown>
    expect(() => (s.createVisualComponent as (name: string) => string)('')).toThrow()
  })
})

describe('Gate SL-4 — createVisualComponent: throws on NOT_PASCAL_CASE name', () => {
  beforeEach(() => { setupSite() })

  it('createVisualComponent("myCard") throws VisualComponentNameError', () => {
    requireSliceAction('createVisualComponent')
    const s = useEditorStore.getState() as Record<string, unknown>
    expect(() => (s.createVisualComponent as (name: string) => string)('myCard')).toThrow()
  })
})

describe('Gate SL-5 — createVisualComponent: throws on PROJECT_DUPLICATE name', () => {
  beforeEach(() => { setupSite() })

  it('creating two VCs with the same name throws on the second', () => {
    requireSliceAction('createVisualComponent')
    const s = useEditorStore.getState() as Record<string, unknown>
    ;(s.createVisualComponent as (name: string) => string)('Card')
    expect(() => (useEditorStore.getState() as Record<string, unknown>).createVisualComponent as (name: string) => string).not.toThrow()
    expect(() =>
      ((useEditorStore.getState() as Record<string, unknown>).createVisualComponent as (name: string) => string)('Card')
    ).toThrow()
  })
})

describe('Gate SL-6 — renameVisualComponent: updates name and filePath', () => {
  beforeEach(() => { setupSite() })

  it('renaming "Card" to "HeroCard" updates name and filePath atomically', () => {
    requireSliceAction('createVisualComponent')
    requireSliceAction('renameVisualComponent')
    const s = useEditorStore.getState() as Record<string, unknown>
    const id = (s.createVisualComponent as (name: string) => string)('Card')
    ;(useEditorStore.getState() as Record<string, unknown>).renameVisualComponent as (id: string, name: string) => void
    ;((useEditorStore.getState() as Record<string, unknown>).renameVisualComponent as (id: string, name: string) => void)(id, 'HeroCard')
    const vcs = (useEditorStore.getState().site as unknown as { visualComponents: Array<{ id: string; name: string; filePath: string }> }).visualComponents
    const vc = vcs.find((v) => v.id === id)!
    expect(vc.name).toBe('HeroCard')
    expect(vc.filePath).toBe('src/components/HeroCard.tsx')
  })
})

describe('Gate SL-7 — renameVisualComponent: throws on invalid new name', () => {
  beforeEach(() => { setupSite() })

  it('renaming a VC to lowercase name throws', () => {
    requireSliceAction('createVisualComponent')
    requireSliceAction('renameVisualComponent')
    const s = useEditorStore.getState() as Record<string, unknown>
    const id = (s.createVisualComponent as (name: string) => string)('Card')
    expect(() =>
      ((useEditorStore.getState() as Record<string, unknown>).renameVisualComponent as (id: string, name: string) => void)(id, 'card')
    ).toThrow()
  })
})

describe('Gate SL-8 — renameVisualComponent: renaming to same name is no-op (selfId check)', () => {
  beforeEach(() => { setupSite() })

  it('renaming "Card" to "Card" does not throw (selfId skip in name validation)', () => {
    requireSliceAction('createVisualComponent')
    requireSliceAction('renameVisualComponent')
    const s = useEditorStore.getState() as Record<string, unknown>
    const id = (s.createVisualComponent as (name: string) => string)('Card')
    expect(() =>
      ((useEditorStore.getState() as Record<string, unknown>).renameVisualComponent as (id: string, name: string) => void)(id, 'Card')
    ).not.toThrow()
  })
})

describe('Gate SL-9 — deleteVisualComponent: removes vc by id', () => {
  beforeEach(() => { setupSite() })

  it('deleteVisualComponent removes the vc from site.visualComponents', () => {
    requireSliceAction('createVisualComponent')
    requireSliceAction('deleteVisualComponent')
    const s = useEditorStore.getState() as Record<string, unknown>
    const id = (s.createVisualComponent as (name: string) => string)('Card')
    ;((useEditorStore.getState() as Record<string, unknown>).deleteVisualComponent as (id: string) => void)(id)
    const vcs = (useEditorStore.getState().site as unknown as { visualComponents: Array<{ id: string }> }).visualComponents ?? []
    expect(vcs.some((vc) => vc.id === id)).toBe(false)
  })
})

describe('Gate SL-10 — deleteVisualComponent: no-op for unknown id', () => {
  beforeEach(() => { setupSite() })

  it('deleteVisualComponent("nonexistent") does not throw', () => {
    requireSliceAction('deleteVisualComponent')
    expect(() =>
      ((useEditorStore.getState() as Record<string, unknown>).deleteVisualComponent as (id: string) => void)('nonexistent')
    ).not.toThrow()
  })
})

describe('Gate SL-11 — addParam: appends a VCParam to vc.params', () => {
  beforeEach(() => { setupSite() })

  it('addParam adds a param with a stable id to the VC', () => {
    requireSliceAction('createVisualComponent')
    requireSliceAction('addParam')
    const s = useEditorStore.getState() as Record<string, unknown>
    const vcId = (s.createVisualComponent as (name: string) => string)('Card')
    ;((useEditorStore.getState() as Record<string, unknown>).addParam as (vcId: string, name: string, type: string) => void)(vcId, 'title', 'string')
    const vcs = (useEditorStore.getState().site as unknown as { visualComponents: Array<{ id: string; params: Array<{ name: string; id: string }> }> }).visualComponents
    const vc = vcs.find((v) => v.id === vcId)!
    expect(vc.params).toHaveLength(1)
    expect(vc.params[0].name).toBe('title')
    // Stable id must be present — survives renames
    expect(typeof vc.params[0].id).toBe('string')
    expect(vc.params[0].id.length).toBeGreaterThan(0)
  })
})

describe('Gate SL-12 — removeParam: removes a VCParam by id', () => {
  beforeEach(() => { setupSite() })

  it('removeParam removes the param from vc.params', () => {
    requireSliceAction('createVisualComponent')
    requireSliceAction('addParam')
    requireSliceAction('removeParam')
    const s = useEditorStore.getState() as Record<string, unknown>
    const vcId = (s.createVisualComponent as (name: string) => string)('Card')
    ;((useEditorStore.getState() as Record<string, unknown>).addParam as (vcId: string, name: string, type: string) => void)(vcId, 'title', 'string')
    const paramId = (useEditorStore.getState().site as unknown as { visualComponents: Array<{ id: string; params: Array<{ id: string }> }> }).visualComponents.find((v) => v.id === vcId)!.params[0].id
    ;((useEditorStore.getState() as Record<string, unknown>).removeParam as (vcId: string, paramId: string) => void)(vcId, paramId)
    const params = (useEditorStore.getState().site as unknown as { visualComponents: Array<{ id: string; params: Array<{ id: string }> }> }).visualComponents.find((v) => v.id === vcId)!.params
    expect(params).toHaveLength(0)
  })
})

describe('Gate SL-13 — addNodeToVc: cycle guard fires at slice write boundary', () => {
  beforeEach(() => { setupSite() })

  it('adding a componentRef that creates a self-cycle throws at the slice boundary', () => {
    requireSliceAction('createVisualComponent')
    requireSliceAction('addNodeToVc')
    const s = useEditorStore.getState() as Record<string, unknown>
    const vcId = (s.createVisualComponent as (name: string) => string)('Card')
    const selfRefNode = {
      id: 'self-ref',
      moduleId: 'base.visualComponentRef',
      props: { componentId: vcId, propOverrides: {} },
      children: [],
      breakpointOverrides: {},
    }
    // The vc's rootNode id — get from state
    const vcRootNodeId = (useEditorStore.getState().site as unknown as { visualComponents: Array<{ id: string; rootNode: { id: string } }> }).visualComponents.find((v) => v.id === vcId)!.rootNode.id
    expect(() =>
      ((useEditorStore.getState() as Record<string, unknown>).addNodeToVc as (vcId: string, parentNodeId: string, newNode: unknown) => void)(vcId, vcRootNodeId, selfRefNode)
    ).toThrow()
  })
})

describe('Gate SL-14 — addNodeToVc: succeeds when no cycle', () => {
  beforeEach(() => { setupSite() })

  it('adding a regular (non-ref) node to a VC succeeds', () => {
    requireSliceAction('createVisualComponent')
    requireSliceAction('addNodeToVc')
    const s = useEditorStore.getState() as Record<string, unknown>
    const vcId = (s.createVisualComponent as (name: string) => string)('Card')
    const headingNode = {
      id: 'heading-1',
      moduleId: 'base.heading',
      props: { text: 'Card Title' },
      children: [],
      breakpointOverrides: {},
    }
    const vcRootNodeId = (useEditorStore.getState().site as unknown as { visualComponents: Array<{ id: string; rootNode: { id: string } }> }).visualComponents.find((v) => v.id === vcId)!.rootNode.id
    expect(() =>
      ((useEditorStore.getState() as Record<string, unknown>).addNodeToVc as (vcId: string, parentNodeId: string, newNode: unknown) => void)(vcId, vcRootNodeId, headingNode)
    ).not.toThrow()
  })
})

// ============================================================================
// Section 7 — validateSite extension
// ============================================================================

describe('Gate VP-1 — backward compat: missing visualComponents defaults to []', () => {
  it('site without visualComponents field validates cleanly → visualComponents: []', () => {
    const raw = rawSite()  // no visualComponents key
    delete (raw as Record<string, unknown>).visualComponents
    const site = validateSite(raw) as SiteDocument & { visualComponents?: unknown[] }
    expect(Array.isArray(site.visualComponents)).toBe(true)
    expect(site.visualComponents).toHaveLength(0)
  })
})

describe('Gate VP-2 — valid VC passes through validateSite cleanly', () => {
  it('a properly-shaped VC is preserved in the output', () => {
    const raw = rawSite({ visualComponents: [rawVC()] })
    const site = validateSite(raw) as SiteDocument & { visualComponents: Array<{ name: string }> }
    expect(site.visualComponents).toHaveLength(1)
    expect(site.visualComponents[0].name).toBe('Card')
  })
})

describe('Gate VP-3 — lenient: VC with invalid name is dropped', () => {
  it('a VC with a lowercase name is silently dropped (lenient per-item)', () => {
    const raw = rawSite({ visualComponents: [rawVC({ name: 'notPascal' })] })
    const site = validateSite(raw) as SiteDocument & { visualComponents: Array<unknown> }
    // Either an empty array or the bad entry is dropped — either way, no 'notPascal' vc
    const hasInvalid = site.visualComponents?.some(
      (vc) => (vc as { name: string }).name === 'notPascal'
    ) ?? false
    expect(hasInvalid).toBe(false)
  })
})

describe('Gate VP-4 — lenient: VC with no name is dropped', () => {
  it('a VC with missing name field is silently dropped', () => {
    const badVC = rawVC()
    delete (badVC as Record<string, unknown>).name
    const raw = rawSite({ visualComponents: [badVC] })
    const site = validateSite(raw) as SiteDocument & { visualComponents: Array<unknown> }
    // Invalid entry must not survive
    const survivors = site.visualComponents ?? []
    expect(survivors.some((vc) => !(vc as { name?: string }).name)).toBe(false)
  })
})

describe('Gate VP-5 — lenient: duplicate VC names are deduplicated (first-wins)', () => {
  it('two VCs with the same name keep only the first one', () => {
    const vc1 = rawVC({ id: 'vc-card-1', name: 'Card' })
    const vc2 = rawVC({ id: 'vc-card-2', name: 'Card' })
    const raw = rawSite({ visualComponents: [vc1, vc2] })
    const site = validateSite(raw) as SiteDocument & { visualComponents: Array<{ id: string }> }
    const cardVCs = site.visualComponents?.filter((v) => (v as { name: string }).name === 'Card') ?? []
    expect(cardVCs).toHaveLength(1)
    // First-wins — vc-card-1 should survive
    expect(cardVCs[0].id).toBe('vc-card-1')
  })
})

describe('Gate VP-6 — filePath auto-corrected on mismatch', () => {
  it('a VC with mismatched filePath is corrected to src/components/{Name}.tsx', () => {
    const vc = rawVC({ name: 'Card', filePath: 'src/components/WrongPath.tsx' })
    const raw = rawSite({ visualComponents: [vc] })
    const site = validateSite(raw) as SiteDocument & { visualComponents: Array<{ name: string; filePath: string }> }
    const cardVC = site.visualComponents?.find((v) => v.name === 'Card')
    expect(cardVC?.filePath).toBe('src/components/Card.tsx')
  })
})

describe('Gate VP-7 — full site with valid VC still passes full validateSite', () => {
  it('validateSite does not throw for a site with a well-formed VC', () => {
    const raw = rawSite({ visualComponents: [rawVC()] })
    expect(() => validateSite(raw)).not.toThrow()
  })
})

// ── Round-trip gates (added post-#635 hot-fix — Coverage gaps surfaced by CR msg #1948) ──

describe('Gate VP-8 — validateSite preserves rootNode.childNodes on VC round-trip', () => {
  /**
   * WHY THIS GATE EXISTS
   * ─────────────────────
   * Code Reviewer (Contribution #638 / msg #1948) found that validatePageNode()
   * does not pass through `childNodes?: PageNode[]`. Any VC saved with a non-trivial
   * tree (container → child nodes) loses all children after validateSite() is called
   * on reload. Silent data loss on every Convex hydration (Constraint #346).
   *
   * Fix (Task #448): validatePageNode() must preserve childNodes by recursively
   * validating each entry and including them in its return shape.
   */
  it('a VC rootNode with childNodes survives validateSite() with childNodes intact', () => {
    const childNode = {
      id: 'child-heading',
      moduleId: 'base.heading',
      props: { text: 'Card Title' },
      children: [],
      breakpointOverrides: {},
    }
    const rootNodeWithChildren = {
      id: 'vc-root',
      moduleId: 'base.container',
      props: {},
      children: ['child-heading'],
      breakpointOverrides: {},
      // The childNodes array carries inline child node objects used by VC tree rendering
      childNodes: [childNode],
    }
    const vc = rawVC({ rootNode: rootNodeWithChildren })
    const raw = rawSite({ visualComponents: [vc] })

    const site = validateSite(raw) as {
      visualComponents: Array<{
        rootNode: { childNodes?: unknown[] }
      }>
    }

    const resultRoot = site.visualComponents[0]?.rootNode
    expect(resultRoot).toBeDefined()

    // childNodes must survive the round-trip — not be stripped by validatePageNode()
    expect(Array.isArray(resultRoot.childNodes)).toBe(true)
    expect((resultRoot.childNodes as unknown[]).length).toBe(1)
    expect((resultRoot.childNodes as Array<{ id: string }>)[0].id).toBe('child-heading')
  })

  it('childNodes are recursively validated (grandchildren preserved)', () => {
    const grandchild = {
      id: 'grand-text',
      moduleId: 'base.text',
      props: { content: 'Hello' },
      children: [],
      breakpointOverrides: {},
    }
    const child = {
      id: 'inner-container',
      moduleId: 'base.container',
      props: {},
      children: ['grand-text'],
      breakpointOverrides: {},
      childNodes: [grandchild],
    }
    const rootNode = {
      id: 'vc-root',
      moduleId: 'base.container',
      props: {},
      children: ['inner-container'],
      breakpointOverrides: {},
      childNodes: [child],
    }
    const vc = rawVC({ rootNode })
    const raw = rawSite({ visualComponents: [vc] })

    const site = validateSite(raw) as {
      visualComponents: Array<{
        rootNode: { childNodes?: Array<{ id: string; childNodes?: Array<{ id: string }> }> }
      }>
    }

    const outerChild = site.visualComponents[0]?.rootNode?.childNodes?.[0]
    expect(outerChild?.id).toBe('inner-container')
    // Grandchildren must survive too
    expect(Array.isArray(outerChild?.childNodes)).toBe(true)
    expect(outerChild?.childNodes?.[0]?.id).toBe('grand-text')
  })
})

describe('Gate VP-9 — validateSite preserves rootNode.propBindings on VC round-trip', () => {
  /**
   * WHY THIS GATE EXISTS
   * ─────────────────────
   * Code Reviewer (Contribution #638 / msg #1948) found that validatePageNode()
   * does not pass through `propBindings?: Record<string, { paramId: string }>`.
   * Any VC saved with param bindings (e.g. a heading node's `text` prop bound to
   * a VC param) loses all bindings after validateSite() on reload.
   * This silently breaks VC re-usability (the whole point of VCParam).
   *
   * Fix (Task #448): validatePageNode() must preserve propBindings in its
   * return shape.
   */
  it('a VC rootNode with propBindings survives validateSite() with bindings intact', () => {
    const rootNodeWithBindings = {
      id: 'vc-root',
      moduleId: 'base.heading',
      props: { text: 'Default Title' },
      children: [],
      breakpointOverrides: {},
      // propBindings maps prop keys → VC param ids for runtime substitution
      propBindings: {
        text: { paramId: 'param-title-1' },
      },
    }
    const vc = rawVC({ rootNode: rootNodeWithBindings })
    const raw = rawSite({ visualComponents: [vc] })

    const site = validateSite(raw) as {
      visualComponents: Array<{
        rootNode: {
          propBindings?: Record<string, { paramId: string }>
        }
      }>
    }

    const resultRoot = site.visualComponents[0]?.rootNode
    expect(resultRoot).toBeDefined()

    // propBindings must survive the round-trip
    expect(resultRoot.propBindings).toBeDefined()
    expect(resultRoot.propBindings?.text).toBeDefined()
    expect(resultRoot.propBindings?.text?.paramId).toBe('param-title-1')
  })

  it('multiple propBindings all survive the round-trip', () => {
    const rootNode = {
      id: 'vc-root',
      moduleId: 'base.container',
      props: {},
      children: [],
      breakpointOverrides: {},
      propBindings: {
        title: { paramId: 'param-title-1' },
        subtitle: { paramId: 'param-subtitle-2' },
        backgroundColor: { paramId: 'param-bg-3' },
      },
    }
    const vc = rawVC({ rootNode })
    const raw = rawSite({ visualComponents: [vc] })

    const site = validateSite(raw) as {
      visualComponents: Array<{
        rootNode: { propBindings?: Record<string, { paramId: string }> }
      }>
    }

    const bindings = site.visualComponents[0]?.rootNode?.propBindings
    expect(bindings).toBeDefined()
    expect(bindings?.title?.paramId).toBe('param-title-1')
    expect(bindings?.subtitle?.paramId).toBe('param-subtitle-2')
    expect(bindings?.backgroundColor?.paramId).toBe('param-bg-3')
  })

  it('propBindings on childNodes also survive the round-trip', () => {
    // propBindings can appear on any node in the VC tree, not just the root
    const childWithBindings = {
      id: 'heading-child',
      moduleId: 'base.heading',
      props: { text: 'Default' },
      children: [],
      breakpointOverrides: {},
      propBindings: {
        text: { paramId: 'param-label-5' },
      },
    }
    const rootNode = {
      id: 'vc-root',
      moduleId: 'base.container',
      props: {},
      children: ['heading-child'],
      breakpointOverrides: {},
      childNodes: [childWithBindings],
    }
    const vc = rawVC({ rootNode })
    const raw = rawSite({ visualComponents: [vc] })

    const site = validateSite(raw) as {
      visualComponents: Array<{
        rootNode: {
          childNodes?: Array<{
            id: string
            propBindings?: Record<string, { paramId: string }>
          }>
        }
      }>
    }

    const child = site.visualComponents[0]?.rootNode?.childNodes?.[0]
    expect(child?.id).toBe('heading-child')
    expect(child?.propBindings?.text?.paramId).toBe('param-label-5')
  })
})
