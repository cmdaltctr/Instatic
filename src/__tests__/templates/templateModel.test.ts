import { describe, expect, it } from 'bun:test'
import { makeSite } from '../fixtures'
import { validateSite, validatePages } from '@core/persistence/validate'
import { useEditorStore } from '@site/store/store'

describe('dynamic template model', () => {
  it('preserves page template metadata and migrates string-prop bindings to tokens', () => {
    const site = makeSite()
    const page = site.pages[0]
    const root = page.nodes[page.rootNodeId]
    page.template = {
      enabled: true,
      context: 'entry',
      tableSlug: 'posts',
      priority: 100,
      conditions: [],
    }
    // Legacy single-binding form on the root's `text` prop. The prop
    // value happens to be undefined on a fresh fixture; the migration
    // accepts that (treats it as a string-typed slot) and converts.
    root.dynamicBindings = {
      text: { source: 'currentEntry', field: 'title', format: 'plain', fallback: 'static' },
    }

    const shell = validateSite(site)
    const pages = validatePages(shell, site.pages)

    // Template metadata round-trips unchanged.
    expect(pages[0].template).toEqual(page.template)
    // The legacy binding has been migrated: `text` prop now contains a
    // `{currentEntry.title}` token, and `dynamicBindings.text` is gone.
    const migrated = pages[0].nodes[page.rootNodeId]
    expect(migrated.dynamicBindings?.text).toBeUndefined()
    expect(migrated.props.text).toBe('{currentEntry.title}')
  })

  it('converts a template back to a page by removing template metadata and all bindings', () => {
    const site = makeSite()
    const page = site.pages[0]
    const root = page.nodes[page.rootNodeId]
    page.template = { enabled: true, context: 'entry', tableSlug: 'posts', priority: 100, conditions: [] }
    root.dynamicBindings = {
      text: { source: 'currentEntry', field: 'title' },
    }

    useEditorStore.setState({ site, activePageId: page.id, hasUnsavedChanges: false })
    useEditorStore.getState().convertTemplateToPage(page.id)

    const nextPage = useEditorStore.getState().site?.pages[0]
    expect(nextPage?.template).toBeUndefined()
    expect(nextPage?.nodes[page.rootNodeId].dynamicBindings).toBeUndefined()
    expect(useEditorStore.getState().hasUnsavedChanges).toBe(true)
  })

  it('sets and removes a node dynamic binding without changing the static prop fallback', () => {
    const site = makeSite()
    const page = site.pages[0]
    const root = page.nodes[page.rootNodeId]
    root.props = { text: 'Static fallback' }

    useEditorStore.setState({ site, activePageId: page.id, hasUnsavedChanges: false })
    useEditorStore.getState().setNodeDynamicBinding(root.id, 'text', {
      source: 'currentEntry',
      field: 'title',
    })

    expect(useEditorStore.getState().site?.pages[0].nodes[root.id].props.text).toBe('Static fallback')
    expect(useEditorStore.getState().site?.pages[0].nodes[root.id].dynamicBindings?.text?.field).toBe('title')

    useEditorStore.getState().clearNodeDynamicBinding(root.id, 'text')

    expect(useEditorStore.getState().site?.pages[0].nodes[root.id].props.text).toBe('Static fallback')
    expect(useEditorStore.getState().site?.pages[0].nodes[root.id].dynamicBindings).toBeUndefined()
  })
})
