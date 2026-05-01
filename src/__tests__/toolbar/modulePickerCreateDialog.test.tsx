import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'fs'
import { ModulePickerDropdown } from '../../editor/components/Toolbar/ModulePickerDropdown'
import { useEditorStore } from '../../core/editor-store/store'
import { makeNode, makePage, makeSite } from '../fixtures'
import '../../modules/base/index'

afterEach(cleanup)

function resetStore() {
  localStorage.clear()
  useEditorStore.setState({
    site: null,
    activePageId: null,
    selectedNodeId: null,
    hoveredNodeId: null,
    activeDocument: null,
    siteExplorerPanelOpen: false,
    mediaExplorerPanelOpen: false,
    codeEditorPanelOpen: false,
    activeEditorFileId: null,
    _historyPast: [],
    _historyFuture: [],
    canUndo: false,
    canRedo: false,
    hasUnsavedChanges: false,
  } as Parameters<typeof useEditorStore.setState>[0])
}

function loadSite() {
  const home = makePage({
    id: 'page-home',
    title: 'Home',
    slug: 'index',
    rootNodeId: 'root-home',
    nodes: {
      'root-home': makeNode({ id: 'root-home', moduleId: 'base.root' }),
    },
  })

  useEditorStore.setState({
    site: makeSite({ pages: [home], files: [], visualComponents: [] }),
    activePageId: 'page-home',
    activeDocument: null,
  } as Parameters<typeof useEditorStore.setState>[0])
}

beforeEach(resetStore)

describe('ModulePickerDropdown site creation', () => {
  it('uses the shared site creation dialog instead of the retired file modal', () => {
    const source = readFileSync(
      new URL('../../editor/components/Toolbar/ModulePickerDropdown.tsx', import.meta.url),
      'utf-8',
    )

    expect(source).not.toContain('NewFileModal')
    expect(source).not.toContain('src/pages/')
    expect(source).not.toContain('src/components/')
    expect(source).toContain('SiteCreateDialog')
  })

  it('creates a page from the toolbar through the simple site dialog', () => {
    loadSite()
    render(<ModulePickerDropdown />)

    fireEvent.click(screen.getByTestId('toolbar-add-module-btn'))
    fireEvent.click(screen.getByTestId('toolbar-add-page-action'))

    const dialog = screen.getByRole('dialog', { name: 'New page' })
    expect(within(dialog).queryByText(/src\/pages/i)).toBeNull()

    fireEvent.change(within(dialog).getByLabelText('Name'), {
      target: { value: 'Product Tour' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }))

    const state = useEditorStore.getState()
    const created = state.site?.pages.find((page) => page.title === 'Product Tour')
    expect(created?.slug).toBe('product-tour')
    expect(state.activePageId).toBe(created?.id)
    expect(state.activeDocument).toBeNull()
  })

  it('creates a component from the toolbar through the simple site dialog', () => {
    loadSite()
    render(<ModulePickerDropdown />)

    fireEvent.click(screen.getByTestId('toolbar-add-module-btn'))
    fireEvent.click(screen.getByTestId('toolbar-add-component-action'))

    const dialog = screen.getByRole('dialog', { name: 'New component' })
    expect(within(dialog).queryByText(/src\/components/i)).toBeNull()

    fireEvent.change(within(dialog).getByLabelText('Name'), {
      target: { value: 'pricing card' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }))

    const state = useEditorStore.getState()
    const created = state.site?.visualComponents.find((component) => component.name === 'PricingCard')
    expect(created).toBeDefined()
    expect(state.activeDocument).toEqual({
      kind: 'visualComponent',
      vcId: created?.id,
    })
  })
})
