import { useEffect } from 'react'
import type { StoreApi, UseBoundStore } from 'zustand'
import { useEditorStore, type EditorStore } from '@site/store/store'
import {
  readEditorLayout,
  writeEditorLayout,
  type FloatingPanelId,
  type StoredEditorLayout,
  type StoredPanelLayout,
} from '@site/layout/panelLayoutStorage'
import {
  clampSidebarWidth,
  LEFT_SIDEBAR_DEFAULT_WIDTH,
  type PropertiesPanelMode,
} from '@site/store/slices/uiSlice'

type EditorStoreApi = UseBoundStore<StoreApi<EditorStore>>

type LayoutSelection = readonly [
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
  domWidth: number,
  propertiesWidth: number,
  activeEditorFileId: string | null,
]

function boolOrCurrent(value: unknown, current: boolean) {
  return typeof value === 'boolean' ? value : current
}

function finiteNumberOrCurrent(value: unknown, current: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : current
}

function panelOpen(layout: StoredEditorLayout, panelId: FloatingPanelId, currentOpen: boolean) {
  return boolOrCurrent(layout.panels?.[panelId]?.open, currentOpen)
}

function panelWidth(layout: StoredEditorLayout, panelId: FloatingPanelId, currentWidth: number) {
  return finiteNumberOrCurrent(layout.panels?.[panelId]?.width, currentWidth)
}

function propertiesMode(layout: StoredEditorLayout, currentMode: PropertiesPanelMode): PropertiesPanelMode {
  const mode = layout.panels?.properties?.mode
  return mode === 'floating' || mode === 'docked' ? mode : currentMode
}

function leftSidebarWidth(layout: StoredEditorLayout, currentWidth: number) {
  return clampSidebarWidth(finiteNumberOrCurrent(
    layout.sidebars?.leftWidth,
    currentWidth || LEFT_SIDEBAR_DEFAULT_WIDTH,
  ))
}

function selectLayoutState(s: EditorStore): LayoutSelection {
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
    s.domTreePanel.width,
    s.propertiesPanel.width,
    s.activeEditorFileId,
  ] as const
}

function sameLayoutSelection(a: LayoutSelection, b: LayoutSelection) {
  return a.every((value, index) => Object.is(value, b[index]))
}

function mergePanel(
  existing: StoredPanelLayout | undefined,
  open: boolean,
  width?: number,
): StoredPanelLayout {
  return {
    ...existing,
    open,
    ...(width !== undefined ? { width } : {}),
  }
}

function layoutFromSelection(
  selection: LayoutSelection,
  existing: StoredEditorLayout | null,
): StoredEditorLayout {
  const [
    domOpen,
    propertiesOpen,
    siteOpen,
    selectorsOpen,
    colorsOpen,
    typographyOpen,
    spacingOpen,
    mediaOpen,
    dependenciesOpen,
    codeEditorOpen,
    agentOpen,
    propertiesMode,
    leftSidebarWidth,
    domWidth,
    propertiesWidth,
    activeEditorFileId,
  ] = selection

  return {
    version: 1,
    panels: {
      dom: mergePanel(existing?.panels?.dom, domOpen, domWidth),
      properties: {
        ...mergePanel(existing?.panels?.properties, propertiesOpen, propertiesWidth),
        mode: propertiesMode,
      },
      site: mergePanel(existing?.panels?.site, siteOpen),
      selectors: mergePanel(existing?.panels?.selectors, selectorsOpen),
      colors: mergePanel(existing?.panels?.colors, colorsOpen),
      typography: mergePanel(existing?.panels?.typography, typographyOpen),
      spacing: mergePanel(existing?.panels?.spacing, spacingOpen),
      media: mergePanel(existing?.panels?.media, mediaOpen),
      dependencies: mergePanel(existing?.panels?.dependencies, dependenciesOpen),
      codeeditor: mergePanel(existing?.panels?.codeeditor, codeEditorOpen),
      agent: mergePanel(existing?.panels?.agent, agentOpen),
    },
    sidebars: {
      ...existing?.sidebars,
      leftWidth: clampSidebarWidth(leftSidebarWidth),
    },
    activeEditorFileId,
  }
}

/**
 * Apply a stored layout to the given editor-store API.
 *
 * Exported (and parameterised on the store API) so it can be called BOTH
 * from the `useEditorLayoutPersistence` hook's mount effect AND
 * synchronously at module-load time in `store.ts` — see the call site
 * there for why synchronous hydration matters (preventing a paint
 * between the default editor state and the persisted state, which
 * triggers the right-sidebar width transition on cold loads).
 */
export function restoreStoredEditorLayout(
  api: EditorStoreApi,
  layout: StoredEditorLayout,
) {
  api.setState((state) => {
    const domOpen = panelOpen(layout, 'dom', !state.domTreePanel.collapsed)
    const siteOpen = panelOpen(layout, 'site', state.siteExplorerPanelOpen)
    const selectorsOpen = panelOpen(layout, 'selectors', state.selectorsPanelOpen)
    const colorsOpen = panelOpen(layout, 'colors', state.colorsPanelOpen)
    const typographyOpen = panelOpen(layout, 'typography', state.typographyPanelOpen)
    const spacingOpen = panelOpen(layout, 'spacing', state.spacingPanelOpen)
    const mediaOpen = panelOpen(layout, 'media', state.mediaExplorerPanelOpen)
    const dependenciesOpen = panelOpen(layout, 'dependencies', state.dependenciesPanelOpen)
    const agentOpen = panelOpen(layout, 'agent', state.isAgentOpen)
    let activeLeftPanel:
      | 'site'
      | 'selectors'
      | 'colors'
      | 'typography'
      | 'spacing'
      | 'media'
      | 'dependencies'
      | 'layers'
      | 'agent'
      | null = null
    if (siteOpen) activeLeftPanel = 'site'
    else if (selectorsOpen) activeLeftPanel = 'selectors'
    else if (colorsOpen) activeLeftPanel = 'colors'
    else if (typographyOpen) activeLeftPanel = 'typography'
    else if (spacingOpen) activeLeftPanel = 'spacing'
    else if (mediaOpen) activeLeftPanel = 'media'
    else if (dependenciesOpen) activeLeftPanel = 'dependencies'
    else if (domOpen) activeLeftPanel = 'layers'
    else if (agentOpen) activeLeftPanel = 'agent'
    const propertiesOpen = panelOpen(
      layout,
      'properties',
      !state.propertiesPanel.collapsed,
    )

    return {
      domTreePanel: {
        ...state.domTreePanel,
        collapsed: activeLeftPanel !== 'layers',
        width: panelWidth(layout, 'dom', state.domTreePanel.width),
      },
      propertiesPanel: {
        ...state.propertiesPanel,
        collapsed: !propertiesOpen,
        width: panelWidth(layout, 'properties', state.propertiesPanel.width),
      },
      propertiesPanelMode: propertiesMode(layout, state.propertiesPanelMode),
      leftSidebarWidth: leftSidebarWidth(layout, state.leftSidebarWidth),
      siteExplorerPanelOpen: activeLeftPanel === 'site',
      selectorsPanelOpen: activeLeftPanel === 'selectors',
      colorsPanelOpen: activeLeftPanel === 'colors',
      typographyPanelOpen: activeLeftPanel === 'typography',
      spacingPanelOpen: activeLeftPanel === 'spacing',
      mediaExplorerPanelOpen: activeLeftPanel === 'media',
      dependenciesPanelOpen: activeLeftPanel === 'dependencies',
      codeEditorPanelOpen: panelOpen(layout, 'codeeditor', state.codeEditorPanelOpen),
      isAgentOpen: activeLeftPanel === 'agent',
      activeEditorFileId:
        layout.activeEditorFileId !== undefined
          ? layout.activeEditorFileId
          : state.activeEditorFileId,
    } satisfies Partial<EditorStore>
  })
}

export function useEditorLayoutPersistence() {
  useEffect(() => {
    // NOTE: The initial hydration also runs synchronously at module-load
    // time in `store.ts` so the first render already sees the persisted
    // layout. This effect re-applies it on mount as a safety net — for
    // example when `<AdminCanvasLayout>` is remounted after navigating
    // back from a non-editor route — but on cold loads it is usually a
    // no-op (the state already matches the layout).
    const storedLayout = readEditorLayout()
    if (storedLayout) {
      restoreStoredEditorLayout(useEditorStore, storedLayout)
    }

    const unsubscribe = useEditorStore.subscribe(
      selectLayoutState,
      (selection) => {
        const existing = readEditorLayout()
        const next = layoutFromSelection(selection, existing)
        writeEditorLayout(next)
      },
      {
        equalityFn: sameLayoutSelection,
        fireImmediately: true,
      },
    )

    return unsubscribe
  }, [])
}
