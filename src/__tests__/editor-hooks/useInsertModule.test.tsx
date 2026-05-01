import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useEditorStore } from '../../core/editor-store/store'
import { registry } from '../../core/module-engine/registry'
import { useInsertModule } from '../../editor/hooks/useInsertModule'
import '../../modules/base/index'

beforeEach(() => {
  useEditorStore.setState({
    site: null,
    activePageId: null,
    selectedNodeId: null,
    hoveredNodeId: null,
    propertiesPanel: { collapsed: true, x: 0, y: 0, width: 360 },
    packageJson: {},
    _historyPast: [],
    _historyFuture: [],
    canUndo: false,
    canRedo: false,
    hasUnsavedChanges: false,
  })
})

afterEach(() => {
  cleanup()
})

describe('useInsertModule', () => {
  it('selects the inserted module and opens Properties', () => {
    useEditorStore.getState().createSite('Test SiteDocument')
    const mod = registry.get('base.text')
    expect(mod).toBeTruthy()

    const { result } = renderHook(() => useInsertModule())
    let insertedNodeId: string | null = null

    act(() => {
      insertedNodeId = result.current(mod!)
    })

    const state = useEditorStore.getState()
    expect(insertedNodeId).toBeTruthy()
    expect(state.selectedNodeId).toBe(insertedNodeId)
    expect(state.propertiesPanel.collapsed).toBe(false)
  })
})
