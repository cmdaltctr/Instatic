import type { PanelPosition } from '../hooks/useDraggablePanel'
import type { PropertiesPanelMode } from '@core/editor-store/slices/uiSlice'

export const EDITOR_LAYOUT_STORAGE_KEY = 'pb-editor-layout-v1'

export type FloatingPanelId = 'dom' | 'properties' | 'site' | 'media' | 'dependencies' | 'codeeditor' | 'agent'

export interface StoredPanelLayout {
  open?: boolean
  position?: PanelPosition
  width?: number
  mode?: PropertiesPanelMode
}

export interface StoredEditorLayout {
  version: 1
  panels?: Partial<Record<FloatingPanelId, StoredPanelLayout>>
  sidebars?: {
    leftWidth?: number
  }
  activeEditorFileId?: string | null
}

function storageAvailable() {
  return typeof localStorage !== 'undefined'
}

function isPanelPosition(value: unknown): value is PanelPosition {
  if (!value || typeof value !== 'object') return false
  const pos = value as Partial<PanelPosition>
  return typeof pos.x === 'number' && Number.isFinite(pos.x)
    && typeof pos.y === 'number' && Number.isFinite(pos.y)
}

export function readEditorLayout(): StoredEditorLayout | null {
  if (!storageAvailable()) return null
  try {
    const raw = localStorage.getItem(EDITOR_LAYOUT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredEditorLayout
    if (parsed?.version !== 1 || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

export function writeEditorLayout(layout: StoredEditorLayout) {
  if (!storageAvailable()) return
  try {
    localStorage.setItem(EDITOR_LAYOUT_STORAGE_KEY, JSON.stringify(layout))
  } catch {
    // Ignore quota/storage errors. Layout persistence is best-effort.
  }
}

export function updateEditorLayout(
  updater: (layout: StoredEditorLayout) => StoredEditorLayout,
) {
  const current = readEditorLayout() ?? { version: 1, panels: {} }
  writeEditorLayout(updater(current))
}

export function readStoredPanelPosition(panelId: FloatingPanelId): PanelPosition | null {
  const position = readEditorLayout()?.panels?.[panelId]?.position
  return isPanelPosition(position) ? position : null
}

export function writeStoredPanelPosition(panelId: FloatingPanelId, position: PanelPosition) {
  updateEditorLayout((layout) => ({
    ...layout,
    version: 1,
    panels: {
      ...layout.panels,
      [panelId]: {
        ...layout.panels?.[panelId],
        position,
      },
    },
  }))
}
