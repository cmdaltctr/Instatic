import { useEffect } from 'react'
import { rawReturn } from 'mutative'
import type { StoreApi, UseBoundStore } from 'zustand'
import { useEditorStore, type EditorStore } from '@site/store/store'
import {
  readWorkspaceLayout,
  writeWorkspaceLayout,
  type EditorWorkspaceId,
  type StoredWorkspaceLayout,
} from '@site/layout/panelLayoutStorage'
import {
  clampSidebarWidth,
  LEFT_SIDEBAR_DEFAULT_WIDTH,
  type PropertiesPanelMode,
} from '@site/store/slices/uiSlice'

type EditorStoreApi = UseBoundStore<StoreApi<EditorStore>>

/**
 * Slice of editor-store state that is persisted into the SITE workspace's
 * stored layout. Other workspaces persist a smaller subset (no left-panel
 * routing, no code editor, no floating mode) since those fields are
 * site-only.
 */
type SiteLayoutSelection = readonly [
  domOpen: boolean,
  propertiesOpen: boolean,
  siteOpen: boolean,
  selectorsOpen: boolean,
  colorsOpen: boolean,
  typographyOpen: boolean,
  spacingOpen: boolean,
  mediaOpen: boolean,
  dependenciesOpen: boolean,
  codeEditorOpen: boolean,
  agentOpen: boolean,
  propertiesMode: PropertiesPanelMode,
  leftSidebarWidth: number,
  propertiesWidth: number,
  activeEditorFileId: string | null,
]

type WorkspaceLayoutSelection = readonly [
  leftSidebarWidth: number,
  propertiesCollapsed: boolean,
  propertiesWidth: number,
]

type DataLayoutSelection = readonly [
  leftSidebarWidth: number,
  propertiesCollapsed: boolean,
  propertiesWidth: number,
  dataSidebarCollapsed: boolean,
]

function boolOrCurrent(value: unknown, current: boolean) {
  return typeof value === 'boolean' ? value : current
}

function finiteNumberOrCurrent(value: unknown, current: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : current
}

function propertiesMode(
  layout: StoredWorkspaceLayout,
  currentMode: PropertiesPanelMode,
): PropertiesPanelMode {
  const mode = layout.propertiesPanelMode
  return mode === 'floating' || mode === 'docked' ? mode : currentMode
}

function leftSidebarWidth(layout: StoredWorkspaceLayout, currentWidth: number) {
  return clampSidebarWidth(finiteNumberOrCurrent(
    layout.leftWidth,
    currentWidth || LEFT_SIDEBAR_DEFAULT_WIDTH,
  ))
}

// ---------------------------------------------------------------------------
// SITE workspace selection / serialization
// ---------------------------------------------------------------------------

function selectSiteLayoutState(s: EditorStore): SiteLayoutSelection {
  return [
    !s.domTreePanel.collapsed,
    !s.propertiesPanel.collapsed,
    s.siteExplorerPanelOpen,
    s.selectorsPanelOpen,
    s.colorsPanelOpen,
    s.typographyPanelOpen,
    s.spacingPanelOpen,
    s.mediaExplorerPanelOpen,
    s.dependenciesPanelOpen,
    s.codeEditorPanelOpen,
    s.isAgentOpen,
    s.propertiesPanelMode,
    s.leftSidebarWidth,
    s.propertiesPanel.width,
    s.activeEditorFileId,
  ] as const
}

function sameSelection<T extends readonly unknown[]>(a: T, b: T) {
  return a.length === b.length && a.every((value, index) => Object.is(value, b[index]))
}

/**
 * Derive the SITE workspace's active left-panel identifier from the editor
 * store's set of "*PanelOpen" flags. Returns null when no panel is showing.
 */
function deriveSiteActiveLeftPanel(selection: SiteLayoutSelection): string | null {
  const [
    domOpen,
    ,
    siteOpen,
    selectorsOpen,
    colorsOpen,
    typographyOpen,
    spacingOpen,
    mediaOpen,
    dependenciesOpen,
    ,
    agentOpen,
  ] = selection

  if (siteOpen) return 'site'
  if (selectorsOpen) return 'selectors'
  if (colorsOpen) return 'colors'
  if (typographyOpen) return 'typography'
  if (spacingOpen) return 'spacing'
  if (mediaOpen) return 'media'
  if (dependenciesOpen) return 'dependencies'
  if (domOpen) return 'layers'
  if (agentOpen) return 'agent'
  return null
}

function siteLayoutFromSelection(
  selection: SiteLayoutSelection,
): StoredWorkspaceLayout {
  const [
    ,
    propertiesOpen,
    ,
    ,
    ,
    ,
    ,
    ,
    ,
    codeEditorOpen,
    ,
    propertiesMode,
    leftSidebarWidth,
    propertiesWidth,
    activeEditorFileId,
  ] = selection

  const activeLeftPanel = deriveSiteActiveLeftPanel(selection)

  return {
    leftWidth: clampSidebarWidth(leftSidebarWidth),
    rightWidth: propertiesWidth,
    leftOpen: activeLeftPanel !== null,
    rightOpen: propertiesOpen,
    activeLeftPanel,
    activeEditorFileId,
    codeEditorPanelOpen: codeEditorOpen,
    propertiesPanelMode: propertiesMode,
  }
}

// ---------------------------------------------------------------------------
// NON-SITE workspace selection / serialization
// ---------------------------------------------------------------------------

function selectWorkspaceLayoutState(s: EditorStore): WorkspaceLayoutSelection {
  return [
    s.leftSidebarWidth,
    s.propertiesPanel.collapsed,
    s.propertiesPanel.width,
  ] as const
}

function workspaceLayoutFromSelection(
  selection: WorkspaceLayoutSelection,
  existing: StoredWorkspaceLayout,
): StoredWorkspaceLayout {
  const [leftSidebarWidth, propertiesCollapsed, propertiesWidth] = selection
  return {
    ...existing,
    leftWidth: clampSidebarWidth(leftSidebarWidth),
    rightWidth: propertiesWidth,
    rightOpen: !propertiesCollapsed,
  }
}

function selectDataLayoutState(s: EditorStore): DataLayoutSelection {
  return [
    s.leftSidebarWidth,
    s.propertiesPanel.collapsed,
    s.propertiesPanel.width,
    s.dataSidebarCollapsed,
  ] as const
}

function dataLayoutFromSelection(
  selection: DataLayoutSelection,
  existing: StoredWorkspaceLayout,
): StoredWorkspaceLayout {
  const [leftSidebarWidth, propertiesCollapsed, propertiesWidth, dataSidebarCollapsed] = selection
  return {
    ...existing,
    leftWidth: clampSidebarWidth(leftSidebarWidth),
    rightWidth: propertiesWidth,
    rightOpen: !propertiesCollapsed,
    leftOpen: !dataSidebarCollapsed,
  }
}

// ---------------------------------------------------------------------------
// Apply a stored layout to the editor store
// ---------------------------------------------------------------------------

/**
 * Apply a stored workspace layout to the editor store.
 *
 * Exported (and parameterised on the store API) so it can be called BOTH
 * from the `useEditorLayoutPersistence` hook's mount effect AND
 * synchronously at module-load time in `store.ts` — see the call site there
 * for why synchronous hydration matters (preventing a paint between the
 * default editor state and the persisted state, which triggers the right-
 * sidebar width transition on cold loads).
 */
export function restoreStoredEditorLayout(
  api: EditorStoreApi,
  workspace: EditorWorkspaceId,
  layout: StoredWorkspaceLayout,
) {
  if (workspace === 'site') {
    restoreSiteLayout(api, layout)
  } else {
    restoreNonSiteLayout(api, workspace, layout)
  }
}

function restoreSiteLayout(api: EditorStoreApi, layout: StoredWorkspaceLayout) {
  api.setState((state) => {
    const propertiesOpen = boolOrCurrent(layout.rightOpen, !state.propertiesPanel.collapsed)
    // Treat `undefined` as "no stored choice — keep current store state"
    // and `null` as "stored, but all panels closed". The first-time visit
    // path falls through with `undefined` so the editor's default left-
    // panel routing (the seed Layers panel) remains visible instead of
    // being overridden to "closed".
    const storedActivePanel = layout.activeLeftPanel
    const applyLeftPanel = storedActivePanel !== undefined

    const leftPanelPatch = applyLeftPanel
      ? {
          domTreePanel: {
            ...state.domTreePanel,
            collapsed: storedActivePanel !== 'layers',
          },
          siteExplorerPanelOpen: storedActivePanel === 'site',
          selectorsPanelOpen: storedActivePanel === 'selectors',
          colorsPanelOpen: storedActivePanel === 'colors',
          typographyPanelOpen: storedActivePanel === 'typography',
          spacingPanelOpen: storedActivePanel === 'spacing',
          mediaExplorerPanelOpen: storedActivePanel === 'media',
          dependenciesPanelOpen: storedActivePanel === 'dependencies',
          isAgentOpen: storedActivePanel === 'agent',
        }
      : {}

    // Partial-merge update: rawReturn tells Mutative to apply this object as-is
    // (zustand merges it) instead of finalizing a draft — and silences Mutative's
    // "wrap in rawReturn()" perf warning. Building the patch object is clearer
    // here than 12 conditional draft assignments.
    return rawReturn({
      propertiesPanel: {
        ...state.propertiesPanel,
        collapsed: !propertiesOpen,
        width: finiteNumberOrCurrent(layout.rightWidth, state.propertiesPanel.width),
      },
      propertiesPanelMode: propertiesMode(layout, state.propertiesPanelMode),
      leftSidebarWidth: leftSidebarWidth(layout, state.leftSidebarWidth),
      codeEditorPanelOpen: boolOrCurrent(layout.codeEditorPanelOpen, state.codeEditorPanelOpen),
      activeEditorFileId: layout.activeEditorFileId !== undefined
        ? layout.activeEditorFileId
        : state.activeEditorFileId,
      ...leftPanelPatch,
    } satisfies Partial<EditorStore>)
  })
}

function restoreNonSiteLayout(
  api: EditorStoreApi,
  workspace: EditorWorkspaceId,
  layout: StoredWorkspaceLayout,
) {
  api.setState((state) => {
    const base: Partial<EditorStore> = {
      leftSidebarWidth: leftSidebarWidth(layout, state.leftSidebarWidth),
      propertiesPanel: {
        ...state.propertiesPanel,
        collapsed: !boolOrCurrent(layout.rightOpen, !state.propertiesPanel.collapsed),
        width: finiteNumberOrCurrent(layout.rightWidth, state.propertiesPanel.width),
      },
    }
    // The Data workspace's single left panel is toggled via
    // `dataSidebarCollapsed`. Restore it from the saved `leftOpen` flag so
    // the data sidebar opens at whatever the user left it last visit.
    if (workspace === 'data' && typeof layout.leftOpen === 'boolean') {
      base.dataSidebarCollapsed = !layout.leftOpen
    }
    return rawReturn(base)
  })
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Subscribe the editor store to per-workspace layout persistence.
 *
 * On mount: re-applies the stored layout as a safety net (the cold-load
 * synchronous hydration in `store.ts` already covered the first paint).
 *
 * Subscribes to the relevant slice of editor-store state and writes back to
 * this workspace's stored layout on every meaningful change. The set of
 * persisted fields differs by workspace — the `site` workspace persists
 * its left-panel routing and floating panel modes; other workspaces persist
 * only the universal sidebar width + right-open state (their left-panel
 * routing is driven by local React state in the page component and goes
 * through `writeWorkspaceLayout` directly).
 */
export function useEditorLayoutPersistence(workspace: EditorWorkspaceId) {
  useEffect(() => {
    const storedLayout = readWorkspaceLayout(workspace)
    restoreStoredEditorLayout(useEditorStore, workspace, storedLayout)

    if (workspace === 'site') {
      let prev = selectSiteLayoutState(useEditorStore.getState())
      const unsubscribe = useEditorStore.subscribe(
        selectSiteLayoutState,
        (selection) => {
          if (sameSelection(selection, prev)) return
          prev = selection
          writeWorkspaceLayout('site', siteLayoutFromSelection(selection))
        },
        { equalityFn: sameSelection, fireImmediately: true },
      )
      return unsubscribe
    }

    if (workspace === 'data') {
      let prev = selectDataLayoutState(useEditorStore.getState())
      const unsubscribe = useEditorStore.subscribe(
        selectDataLayoutState,
        (selection) => {
          if (sameSelection(selection, prev)) return
          prev = selection
          const existing = readWorkspaceLayout('data')
          writeWorkspaceLayout('data', dataLayoutFromSelection(selection, existing))
        },
        { equalityFn: sameSelection, fireImmediately: true },
      )
      return unsubscribe
    }

    let prev = selectWorkspaceLayoutState(useEditorStore.getState())
    const unsubscribe = useEditorStore.subscribe(
      selectWorkspaceLayoutState,
      (selection) => {
        if (sameSelection(selection, prev)) return
        prev = selection
        const existing = readWorkspaceLayout(workspace)
        writeWorkspaceLayout(workspace, workspaceLayoutFromSelection(selection, existing))
      },
      { equalityFn: sameSelection, fireImmediately: true },
    )
    return unsubscribe
  }, [workspace])
}
