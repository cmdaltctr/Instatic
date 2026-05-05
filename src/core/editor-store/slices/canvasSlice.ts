import type { EditorStoreSliceCreator } from '../types'

type CanvasMode = 'select' | 'pan' | 'insert'

/**
 * Canvas render mode.
 *
 * - 'design': the React-based module renderer is shown — fully reactive to
 *   property edits, no script execution. Selection / drag / drop work here.
 * - 'preview': the runtime-preview iframe is shown — site scripts actually run
 *   inside a sandboxed iframe so authors can test behavior. Property edits
 *   while in preview mode do NOT auto-refresh the iframe; the user clicks
 *   Refresh (or navigates page/breakpoint, or edits scripts/deps) to rebuild.
 *
 * The two surfaces are mutually exclusive — preview mode does not stack the
 * iframe over the design canvas. This avoids the "scripts re-execute on every
 * keystroke" problem the previous overlay design caused.
 */
export type CanvasView = 'design' | 'preview'

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 4
export const DEFAULT_ZOOM = 1

/**
 * Maximum pan offset in each direction (pixels in document space).
 * Belt-and-suspenders guard against agent tool writes that bypass call-site guards.
 * Architecture spec: Contribution #435, Security Auditor review (message #1270).
 */
export const MAX_PAN = 50_000

export interface CanvasSlice {
  zoom: number
  panX: number
  panY: number
  /** Active breakpoint ID — determines which viewport frame is "focused" */
  activeBreakpointId: string
  /** Active page ID */
  activePageId: string | null
  /**
   * Page ID to restore when exiting VC canvas mode.
   * Captured by setActiveDocument when transitioning into VC mode from
   * the default page canvas (activeDocument === null). Cleared on exit.
   */
  previousActivePageId: string | null
  /** Current editor interaction mode */
  canvasMode: CanvasMode
  /** Current canvas render mode — design (live module editor) or preview (sandboxed runtime) */
  canvasView: CanvasView

  setZoom: (zoom: number) => void
  setPan: (x: number, y: number) => void
  setCanvasTransform: (zoom: number, x: number, y: number) => void
  setActiveBreakpoint: (id: string) => void
  setActivePage: (pageId: string) => void
  setCanvasMode: (mode: CanvasMode) => void
  setCanvasView: (view: CanvasView) => void
  resetView: () => void
  /**
   * Step zoom up to the next preset level. When `originX`/`originY` are
   * provided (in viewport-space, relative to the canvas root), the pan is
   * adjusted so that origin point stays fixed on screen — i.e. the zoom is
   * "around" that point. Toolbar buttons / keyboard shortcuts pass the
   * canvas viewport center; without an origin the zoom uses (0, 0) which
   * pulls content toward the top-left of the document.
   */
  zoomIn: (originX?: number, originY?: number) => void
  zoomOut: (originX?: number, originY?: number) => void
  zoomTo: (zoom: number, originX?: number, originY?: number) => void
}

const ZOOM_STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]

function clampZoom(z: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z))
}

function clampPan(v: number): number {
  return Math.max(-MAX_PAN, Math.min(MAX_PAN, v))
}

function nearestZoomStep(current: number, direction: 1 | -1): number {
  if (direction === 1) {
    return ZOOM_STEPS.find((z) => z > current + 1e-9) ?? MAX_ZOOM
  } else {
    return [...ZOOM_STEPS].reverse().find((z) => z < current - 1e-9) ?? MIN_ZOOM
  }
}

// Contribute this slice's fields to the combined `EditorStore` type via TS
// module augmentation. See `../types.ts` for why we use this pattern.
declare module '@core/editor-store/types' {
  interface EditorStore extends CanvasSlice {}
}

export const createCanvasSlice: EditorStoreSliceCreator<CanvasSlice> = (set, get) => ({
  zoom: DEFAULT_ZOOM,
  panX: 0,
  panY: 0,
  activeBreakpointId: 'desktop',
  activePageId: null,
  previousActivePageId: null,
  canvasMode: 'select',
  canvasView: 'design',

  setZoom: (zoom) => set({ zoom: clampZoom(zoom) }),

  setPan: (panX, panY) => set({ panX: clampPan(panX), panY: clampPan(panY) }),

  setCanvasTransform: (zoom, panX, panY) => set({
    zoom: clampZoom(zoom),
    panX: clampPan(panX),
    panY: clampPan(panY),
  }),

  setActiveBreakpoint: (id) => set({ activeBreakpointId: id }),

  setActivePage: (pageId) => set({ activePageId: pageId }),

  setCanvasMode: (mode) => set({ canvasMode: mode }),

  setCanvasView: (view) => set({ canvasView: view }),

  resetView: () => set({ zoom: DEFAULT_ZOOM, panX: 0, panY: 0 }),

  zoomIn: (originX, originY) => {
    const { zoom, panX, panY, zoomTo } = get()
    const next = nearestZoomStep(zoom, 1)
    if (originX !== undefined && originY !== undefined) {
      zoomTo(next, originX, originY)
    } else {
      // Fallback: keep current pan. Used by call sites that don't have a
      // viewport rect handy (shouldn't occur for user-facing actions).
      set({ zoom: next, panX: clampPan(panX), panY: clampPan(panY) })
    }
  },

  zoomOut: (originX, originY) => {
    const { zoom, panX, panY, zoomTo } = get()
    const next = nearestZoomStep(zoom, -1)
    if (originX !== undefined && originY !== undefined) {
      zoomTo(next, originX, originY)
    } else {
      set({ zoom: next, panX: clampPan(panX), panY: clampPan(panY) })
    }
  },

  /**
   * Zoom to a target level, optionally around a viewport origin point.
   * Used for Ctrl+Wheel zoom (zoom towards cursor position).
   */
  zoomTo: (targetZoom, originX = 0, originY = 0) => {
    const { zoom, panX, panY } = get()
    const newZoom = clampZoom(targetZoom)
    const scale = newZoom / zoom
    // Adjust pan so the origin point stays fixed in viewport space
    const newPanX = clampPan(originX - scale * (originX - panX))
    const newPanY = clampPan(originY - scale * (originY - panY))
    set({ zoom: newZoom, panX: newPanX, panY: newPanY })
  },
})

// ---------------------------------------------------------------------------
// Zoom math utilities — exported as pure functions for unit testing
// ---------------------------------------------------------------------------

export { clampZoom, clampPan, nearestZoomStep, ZOOM_STEPS }
