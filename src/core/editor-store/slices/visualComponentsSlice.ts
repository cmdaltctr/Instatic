/**
 * visualComponentsSlice — Visual Components Data Layer store slice.
 *
 * Architecture source: Contribution #619 §2, §3, §6, §10 (Task #436)
 *
 * Manages site.visualComponents[] CRUD.
 * State lives in site.visualComponents (owned by siteSlice);
 * this slice owns only the action methods — same pattern as filesSlice.
 *
 * Every write boundary:
 *  - Calls validateComponentName() and throws on invalid name.
 *  - Derives filePath automatically from name (not user-settable).
 *  - Calls wouldCreateCycle() at addNodeToVc boundary and throws on cycle.
 *
 * Constraint #269: MUST NOT import from editor/.
 * This is a pure data-layer slice.
 */

import { produce } from 'immer'
import { nanoid } from 'nanoid'
import type { StateCreator } from 'zustand'
import type { EditorStore } from '../store'
import type { VisualComponent, VCParam } from '../../visualComponents/types'
import { validateComponentName, validateParamName } from '../../visualComponents/nameValidation'
import { wouldCreateCycle } from '../../visualComponents/recursionGuard'

// ---------------------------------------------------------------------------
// Custom error types
// ---------------------------------------------------------------------------

export class VisualComponentNameError extends Error {
  readonly code: string
  constructor(message: string, code: string) {
    super(`[visualComponentsSlice] ${message}`)
    this.name = 'VisualComponentNameError'
    this.code = code
  }
}

export class VisualComponentParamNameError extends Error {
  readonly code: string
  constructor(message: string, code: string) {
    super(`[visualComponentsSlice] ${message}`)
    this.name = 'VisualComponentParamNameError'
    this.code = code
  }
}

export class VisualComponentRecursionError extends Error {
  constructor(message: string) {
    super(`[visualComponentsSlice] ${message}`)
    this.name = 'VisualComponentRecursionError'
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Derive the canonical filePath from a VC name */
function deriveFilePath(name: string): string {
  return `src/components/${name}.tsx`
}

/** PageNode shape used internally in VC trees */
interface VCNode {
  id: string
  moduleId: string
  props: Record<string, unknown>
  children: string[]
  breakpointOverrides: Record<string, Partial<Record<string, unknown>>>
  childNodes?: VCNode[]
  propBindings?: Record<string, { paramId: string }>
  label?: string
  locked?: boolean
  hidden?: boolean
  classIds?: string[]
}

/** DFS to find a node by ID in a VC tree (walks childNodes) */
function findNodeById(root: VCNode, id: string): VCNode | null {
  if (root.id === id) return root
  if (root.childNodes) {
    for (const child of root.childNodes) {
      const found = findNodeById(child, id)
      if (found) return found
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Slice interface
// ---------------------------------------------------------------------------

export interface VisualComponentsSlice {
  /**
   * Create a new Visual Component with the given PascalCase name.
   * Returns the new VC's id.
   *
   * Throws VisualComponentNameError if:
   * - `name` is empty, not PascalCase, a reserved word, a base module name,
   *   or already used by another VC in the site.
   */
  createVisualComponent(name: string): string

  /**
   * Rename a Visual Component. Updates both `name` and `filePath` atomically.
   *
   * Throws VisualComponentNameError if the new name is invalid.
   * No-op if the id does not exist.
   * Self-rename (same name) is a no-op and does NOT throw.
   */
  renameVisualComponent(id: string, newName: string): void

  /**
   * Delete a Visual Component by id.
   * No-op if the id does not exist.
   */
  deleteVisualComponent(id: string): void

  /**
   * Add a param to a VC's param surface.
   * Returns the new param's stable id.
   * No-op if the VC does not exist.
   */
  addParam(vcId: string, name: string, type: VCParam['type'], defaultValue?: unknown): string

  /**
   * Remove a param from a VC by its stable id.
   * No-op if the VC or param does not exist.
   */
  removeParam(vcId: string, paramId: string): void

  /**
   * Add a new node to a VC's canvas tree under `parentNodeId`.
   *
   * Throws VisualComponentRecursionError if `newNode` is a
   * base.visualComponentRef that would create a cycle.
   *
   * No-op if the VC or parent node does not exist.
   */
  addNodeToVc(vcId: string, parentNodeId: string, newNode: VCNode): void
}

// ---------------------------------------------------------------------------
// Slice implementation
// ---------------------------------------------------------------------------

export const createVisualComponentsSlice: StateCreator<EditorStore, [], [], VisualComponentsSlice> = (set, get) => ({

  createVisualComponent(name) {
    const { site } = get()
    if (!site) throw new Error('[visualComponentsSlice] Site document is not initialized')

    const validation = validateComponentName(name, site.visualComponents ?? [])
    if (!validation.ok) {
      throw new VisualComponentNameError(validation.reason, validation.error)
    }

    const id = nanoid()
    const rootNodeId = nanoid()
    const now = Date.now()

    const rootNode: VCNode = {
      id: rootNodeId,
      moduleId: 'base.root',
      props: {},
      children: [],
      breakpointOverrides: {},
    }

    const newVC: VisualComponent = {
      id,
      name,
      rootNode: rootNode as VisualComponent['rootNode'],
      params: [],
      breakpoints: [],
      classIds: [],
      filePath: deriveFilePath(name),
      generated: true,
      ejected: false,
      createdAt: now,
    }

    set(
      produce((state: EditorStore) => {
        if (!state.site) return
        if (!state.site.visualComponents) state.site.visualComponents = []
        state.site.visualComponents.push(newVC)
        state.site.updatedAt = now
      }),
    )

    return id
  },

  renameVisualComponent(id, newName) {
    const { site } = get()
    if (!site) throw new Error('[visualComponentsSlice] Site document is not initialized')

    const validation = validateComponentName(newName, site.visualComponents ?? [], id)
    if (!validation.ok) {
      throw new VisualComponentNameError(validation.reason, validation.error)
    }

    set(
      produce((state: EditorStore) => {
        if (!state.site) return
        const vc = (state.site.visualComponents ?? []).find((v) => v.id === id)
        if (!vc) return
        vc.name = newName
        vc.filePath = deriveFilePath(newName)
        state.site.updatedAt = Date.now()
      }),
    )
  },

  deleteVisualComponent(id) {
    set(
      produce((state: EditorStore) => {
        if (!state.site) return
        if (!state.site.visualComponents) return
        const idx = state.site.visualComponents.findIndex((v) => v.id === id)
        if (idx === -1) return
        state.site.visualComponents.splice(idx, 1)
        state.site.updatedAt = Date.now()
      }),
    )
  },

  addParam(vcId, name, type, defaultValue = '') {
    // Validate param name BEFORE entering Immer (pure read from current state)
    const { site } = get()
    if (site) {
      const vc = (site.visualComponents ?? []).find((v) => v.id === vcId)
      if (vc) {
        const validation = validateParamName(name, vc.params)
        if (!validation.ok) {
          throw new VisualComponentParamNameError(validation.reason, validation.error)
        }
      }
    }

    const paramId = nanoid()

    set(
      produce((state: EditorStore) => {
        if (!state.site) return
        const vc = (state.site.visualComponents ?? []).find((v) => v.id === vcId)
        if (!vc) return

        const newParam: VCParam = {
          id: paramId,
          name,
          type,
          defaultValue,
          required: false,
        }
        vc.params.push(newParam)
        state.site.updatedAt = Date.now()
      }),
    )

    return paramId
  },

  removeParam(vcId, paramId) {
    set(
      produce((state: EditorStore) => {
        if (!state.site) return
        const vc = (state.site.visualComponents ?? []).find((v) => v.id === vcId)
        if (!vc) return
        const idx = vc.params.findIndex((p) => p.id === paramId)
        if (idx === -1) return
        vc.params.splice(idx, 1)
        state.site.updatedAt = Date.now()
      }),
    )
  },

  addNodeToVc(vcId, parentNodeId, newNode) {
    const { site } = get()
    if (!site) throw new Error('[visualComponentsSlice] Site document is not initialized')

    const vcs = site.visualComponents ?? []

    // Cycle guard — runs BEFORE any state mutation (slice write boundary, §3)
    if (newNode.moduleId === 'base.visualComponentRef') {
      const componentId = (newNode.props as Record<string, unknown>).componentId
      if (typeof componentId === 'string') {
        if (wouldCreateCycle(vcs, vcId, componentId)) {
          throw new VisualComponentRecursionError(
            `Circular component reference: embedding "${componentId}" inside "${vcId}" would create a cycle.`,
          )
        }
      }
    }

    set(
      produce((state: EditorStore) => {
        if (!state.site) return
        const vc = (state.site.visualComponents ?? []).find((v) => v.id === vcId)
        if (!vc) return

        const parent = findNodeById(vc.rootNode as VCNode, parentNodeId)
        if (!parent) return

        // Duplicate-node-id guard — silently no-op if node ID already exists in the tree
        if (findNodeById(vc.rootNode as VCNode, newNode.id)) return

        // Add to flat children IDs list (standard PageNode.children)
        if (!parent.children) parent.children = []
        parent.children.push(newNode.id)

        // Add to nested childNodes list (VC tree traversal format)
        if (!parent.childNodes) parent.childNodes = []
        parent.childNodes.push(newNode as unknown as VCNode)

        state.site.updatedAt = Date.now()
      }),
    )
  },
})
