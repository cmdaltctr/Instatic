import { useEffect } from 'react'
import { useEditorStore, type EditorStore } from '@core/editor-store/store'
import {
  readEditorLayout,
  writeEditorLayout,
  type FloatingPanelId,
  type StoredEditorLayout,
  type StoredPanelLayout,
} from '../layout/panelLayoutStorage'
import {
  clampSidebarWidth,
  LEFT_SIDEBAR_DEFAULT_WIDTH,
  type PropertiesPanelMode,
} from '@core/editor-store/slices/uiSlice'

type LayoutSelection = readonly [
  domOpen: boolean,
  propertiesOpen: boolean,
  siteOpen: boolean,
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

function restoreStoredLayout(layout: StoredEditorLayout) {
  useEditorStore.setState((state) => {
    const domOpen = panelOpen(layout, 'dom', !state.domTreePanel.collapsed)
    const siteOpen = panelOpen(layout, 'site', state.siteExplorerPanelOpen)
    const mediaOpen = panelOpen(layout, 'media', state.mediaExplorerPanelOpen)
    const dependenciesOpen = panelOpen(layout, 'dependencies', state.dependenciesPanelOpen)
    const agentOpen = panelOpen(layout, 'agent', state.isAgentOpen)
    const activeLeftPanel = siteOpen
      ? 'site'
      : mediaOpen
        ? 'media'
        : dependenciesOpen
          ? 'dependencies'
      : domOpen
        ? 'layers'
        : agentOpen
          ? 'agent'
          : null
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
    const storedLayout = readEditorLayout()
    if (storedLayout) {
      restoreStoredLayout(storedLayout)
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
