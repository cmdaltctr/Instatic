import { afterEach, describe, expect, it } from 'bun:test'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from '../../admin/lib/router'
import { AdminSectionNavigation } from '../../admin/AdminLayout'
import { AdminSessionProvider } from '../../admin/session'
import { ContentPage } from '../../admin/content/ContentPage'
import type { CmsCurrentUser } from '@core/persistence'
import { useEditorStore } from '@core/editor-store/store'
import { makeSite } from '../fixtures'

const originalFetch = globalThis.fetch
const now = '2026-05-07T10:00:00.000Z'

function currentUser(capabilities: string[]): CmsCurrentUser {
  return {
    id: 'editor_1',
    email: 'editor@example.com',
    displayName: 'Editor',
    status: 'active',
    role: {
      id: 'editor',
      slug: 'editor',
      name: 'Editor',
      description: '',
      isSystem: true,
      capabilities,
    },
    capabilities,
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function setupEditorState() {
  const site = makeSite({ name: 'Capability Site' })
  useEditorStore.setState({
    site,
    activePageId: site.pages[0].id,
    selectedNodeId: null,
    selectedNodeIds: [],
    hoveredNodeId: null,
    activeBreakpointId: 'desktop',
    domTreePanel: { collapsed: false, x: 0, y: 0, width: 280 },
    propertiesPanel: { collapsed: false, x: 0, y: 0, width: 360 },
    propertiesPanelMode: 'docked',
    leftSidebarWidth: 320,
    focusedPanel: 'canvas',
    siteExplorerPanelOpen: false,
    mediaExplorerPanelOpen: false,
    codeEditorPanelOpen: false,
    activeEditorFileId: null,
    activeMediaAssetPreview: null,
    dependenciesPanelOpen: false,
    isAgentOpen: false,
    isAgentStreaming: false,
    agentMessages: [],
    agentError: null,
    _historyPast: [],
    _historyFuture: [],
    canUndo: false,
    canRedo: false,
    hasUnsavedChanges: false,
  } as Parameters<typeof useEditorStore.setState>[0])
}

afterEach(() => {
  globalThis.fetch = originalFetch
  cleanup()
})

describe('capability-aware admin UI', () => {
  it('hides admin sections that the current user cannot access', () => {
    render(
      <MemoryRouter initialEntries={['/admin/content']}>
        <AdminSessionProvider user={currentUser(['content.create', 'content.edit.own', 'content.publish.own'])}>
          <AdminSectionNavigation section="content" />
        </AdminSessionProvider>
      </MemoryRouter>,
    )

    expect(screen.getByText('Content')).toBeDefined()
    expect(screen.queryByRole('link', { name: 'Site' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Plugins' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Users' })).toBeNull()
  })

  it('removes collection management and author reassignment for own-content editors', async () => {
    setupEditorState()
    const calls: Array<{ url: string; method: string }> = []
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      calls.push({ url, method })
      if (url === '/admin/api/cms/content/collections') {
        return json({
          collections: [{
            id: 'posts',
            name: 'Posts',
            slug: 'posts',
            routeBase: '/posts',
            singularLabel: 'Post',
            pluralLabel: 'Posts',
            createdAt: now,
            updatedAt: now,
          }],
        })
      }
      if (url === '/admin/api/cms/content/collections/posts/entries' && init?.method === 'GET') {
        return json({
          entries: [{
            id: 'entry_1',
            collectionId: 'posts',
            title: 'Own draft',
            slug: 'own-draft',
            status: 'draft',
            bodyMarkdown: '',
            featuredMediaId: null,
            seoTitle: '',
            seoDescription: '',
            authorUserId: 'editor_1',
            author: { id: 'editor_1', email: 'editor@example.com', displayName: 'Editor', roleName: 'Editor' },
            createdByUserId: 'editor_1',
            updatedByUserId: 'editor_1',
            publishedByUserId: null,
            createdAt: now,
            updatedAt: now,
            publishedAt: null,
            deletedAt: null,
          }],
        })
      }
      if (url === '/admin/api/cms/media') return json({ assets: [] })
      return json({ error: `Unhandled ${url}` }, 500)
    }

    render(
      <MemoryRouter>
        <AdminSessionProvider user={currentUser(['content.create', 'content.edit.own', 'content.publish.own'])}>
          <ContentPage />
        </AdminSessionProvider>
      </MemoryRouter>,
    )

    const explorer = await screen.findByTestId('content-explorer-panel')
    expect(within(explorer).queryByRole('button', { name: /new collection/i })).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'Author' })).toBeNull()

    fireEvent.contextMenu(await within(explorer).findByRole('button', { name: /own draft draft/i }))
    const menu = screen.getByRole('menu', { name: 'Content item options' })
    expect(within(menu).getByRole('menuitem', { name: 'Publish' })).toBeDefined()
    expect(within(menu).queryByRole('menuitem', { name: 'Move to collection' })).toBeNull()
    expect(calls).not.toContainEqual({
      url: '/admin/api/cms/content/authors',
      method: 'GET',
    })
  })

  it('publishes owned entries from settings without requiring edit rights', async () => {
    setupEditorState()
    const calls: Array<{ url: string; method: string }> = []
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      calls.push({ url, method })

      if (url === '/admin/api/cms/content/collections') {
        return json({
          collections: [{
            id: 'posts',
            name: 'Posts',
            slug: 'posts',
            routeBase: '/posts',
            singularLabel: 'Post',
            pluralLabel: 'Posts',
            createdAt: now,
            updatedAt: now,
          }],
        })
      }

      if (url === '/admin/api/cms/content/collections/posts/entries' && method === 'GET') {
        return json({
          entries: [{
            id: 'entry_1',
            collectionId: 'posts',
            title: 'Publishable draft',
            slug: 'publishable-draft',
            status: 'draft',
            bodyMarkdown: '',
            featuredMediaId: null,
            seoTitle: '',
            seoDescription: '',
            authorUserId: 'editor_1',
            author: { id: 'editor_1', email: 'editor@example.com', displayName: 'Editor', roleName: 'Editor' },
            createdByUserId: 'editor_1',
            updatedByUserId: 'editor_1',
            publishedByUserId: null,
            createdAt: now,
            updatedAt: now,
            publishedAt: null,
            deletedAt: null,
          }],
        })
      }

      if (url === '/admin/api/cms/content/entries/entry_1/publish' && method === 'POST') {
        return json({
          entry: {
            id: 'entry_1',
            collectionId: 'posts',
            title: 'Publishable draft',
            slug: 'publishable-draft',
            status: 'published',
            bodyMarkdown: '',
            featuredMediaId: null,
            seoTitle: '',
            seoDescription: '',
            authorUserId: 'editor_1',
            author: { id: 'editor_1', email: 'editor@example.com', displayName: 'Editor', roleName: 'Editor' },
            createdByUserId: 'editor_1',
            updatedByUserId: 'editor_1',
            publishedByUserId: 'editor_1',
            createdAt: now,
            updatedAt: now,
            publishedAt: now,
            deletedAt: null,
          },
        })
      }

      if (url === '/admin/api/cms/content/entries/entry_1' && method === 'PUT') {
        return json({ error: 'edit forbidden' }, 403)
      }

      return json({ error: `Unhandled ${method} ${url}` }, 500)
    }

    render(
      <MemoryRouter>
        <AdminSessionProvider user={currentUser(['content.publish.own'])}>
          <ContentPage />
        </AdminSessionProvider>
      </MemoryRouter>,
    )

    const statusSelect = await screen.findByLabelText('Status')
    expect((screen.getByLabelText('Title') as HTMLTextAreaElement).disabled).toBe(true)

    fireEvent.change(statusSelect, { target: { value: 'published' } })

    await screen.findByText('Published')
    expect(calls).toContainEqual({
      url: '/admin/api/cms/content/entries/entry_1/publish',
      method: 'POST',
    })
    expect(calls).not.toContainEqual({
      url: '/admin/api/cms/content/entries/entry_1',
      method: 'PUT',
    })
  })
})
