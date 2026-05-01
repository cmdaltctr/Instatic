import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'fs'
import { ProjectExplorerPanel } from '../../editor/components/ProjectExplorerPanel'
import { CodeEditorPanel } from '../../editor/components/CodeEditor'
import { useEditorStore } from '../../core/editor-store/store'
import { makeNode, makePage, makeProject } from '../fixtures'
import type { VisualComponent } from '../../core/visualComponents/types'
import '../../modules/base/index'

afterEach(cleanup)

function resetStore() {
  localStorage.clear()
  useEditorStore.setState({
    project: null,
    activePageId: null,
    selectedNodeId: null,
    hoveredNodeId: null,
    activeDocument: null,
    projectExplorerPanelOpen: false,
    codeEditorPanelOpen: false,
    activeEditorFileId: null,
    activeMediaAssetPreview: null,
    _historyPast: [],
    _historyFuture: [],
    canUndo: false,
    canRedo: false,
    hasUnsavedChanges: false,
  } as Parameters<typeof useEditorStore.setState>[0])
}

function makeVisualComponent(name: string): VisualComponent {
  return {
    id: `vc-${name}`,
    name,
    rootNode: {
      id: `root-${name}`,
      moduleId: 'base.root',
      props: {},
      children: [],
      breakpointOverrides: {},
    },
    params: [],
    breakpoints: [],
    classIds: [],
    filePath: `src/components/${name}.tsx`,
    generated: true,
    ejected: false,
    createdAt: 1_700_000_000_000,
  }
}

function loadProject() {
  const home = makePage({
    id: 'page-home',
    title: 'Home',
    slug: 'index',
    rootNodeId: 'root-home',
    nodes: {
      'root-home': makeNode({ id: 'root-home', moduleId: 'base.root' }),
    },
  })
  const pricing = makePage({
    id: 'page-pricing',
    title: 'Pricing',
    slug: 'pricing',
    rootNodeId: 'root-pricing',
    nodes: {
      'root-pricing': makeNode({ id: 'root-pricing', moduleId: 'base.root' }),
    },
  })

  useEditorStore.setState({
    project: makeProject({
      pages: [home, pricing],
      visualComponents: [makeVisualComponent('HeroCard')],
      files: [
        {
          id: 'style-1',
          path: 'src/styles/theme.css',
          type: 'style',
          content: ':root { color-scheme: light; }',
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'script-1',
          path: 'src/scripts/analytics.ts',
          type: 'script',
          content: 'export {}',
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'asset-1',
          path: 'public/logo.svg',
          type: 'asset',
          blob: { mimeType: 'image/svg+xml', base64: 'PHN2Zy8+' },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    }),
    activePageId: 'page-home',
    projectExplorerPanelOpen: true,
  } as Parameters<typeof useEditorStore.setState>[0])
}

beforeEach(resetStore)

describe('ProjectExplorerPanel', () => {
  it('uses the shared project creation dialog instead of native prompts', () => {
    const source = readFileSync(
      new URL('../../editor/components/ProjectExplorerPanel/ProjectExplorerPanel.tsx', import.meta.url),
      'utf-8',
    )

    expect(source).not.toContain('window.prompt')
    expect(source).toContain('ProjectCreateDialog')
  })

  it('shows project concepts instead of generated source paths', () => {
    loadProject()
    render(<ProjectExplorerPanel variant="docked" />)

    const panel = screen.getByTestId('project-explorer-panel')
    expect(within(panel).getByRole('heading', { name: 'Pages' })).toBeDefined()
    expect(within(panel).getByRole('heading', { name: 'Components' })).toBeDefined()
    expect(within(panel).getByRole('heading', { name: 'Styles' })).toBeDefined()
    expect(within(panel).getByRole('heading', { name: 'Assets' })).toBeDefined()
    expect(within(panel).getByRole('heading', { name: 'Scripts' })).toBeDefined()

    expect(within(panel).getByRole('button', { name: /open page home/i })).toBeDefined()
    expect(within(panel).getByRole('button', { name: /open component herocard/i })).toBeDefined()
    expect(within(panel).getByText('theme.css')).toBeDefined()
    expect(within(panel).getByText('logo.svg')).toBeDefined()
    expect(within(panel).getByText('analytics.ts')).toBeDefined()

    expect(within(panel).queryByText('src/pages/Index.tsx')).toBeNull()
    expect(within(panel).queryByText('src/components/HeroCard.tsx')).toBeNull()
  })

  it('Project Explorer can be wired to CMS media instead of base64 project files', () => {
    const source = readFileSync(
      new URL('../../editor/components/ProjectExplorerPanel/ProjectExplorerPanel.tsx', import.meta.url),
      'utf-8',
    )

    expect(source).toContain('mediaMode')
    expect(source).toContain('listCmsMediaAssets')
    expect(source).toContain('uploadCmsMediaAsset')
  })

  it('opens CMS media assets in the editor preview instead of navigating away', async () => {
    loadProject()
    const originalFetch = globalThis.fetch
    const originalOpen = window.open
    const openCalls: unknown[] = []
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({
        assets: [{
          id: 'media-1',
          filename: 'hero.png',
          mimeType: 'image/png',
          sizeBytes: 12,
          publicPath: '/uploads/hero.png',
          createdAt: '2026-01-03T00:00:00.000Z',
        }],
      }), { status: 200 })) as typeof fetch
    window.open = ((...args: unknown[]) => {
      openCalls.push(args)
      return null
    }) as typeof window.open

    try {
      render(
        <>
          <ProjectExplorerPanel variant="docked" mediaMode="cms" />
          <CodeEditorPanel />
        </>,
      )

      const mediaRow = await screen.findByRole('button', { name: /open media hero\.png/i })
      fireEvent.click(mediaRow)

      await waitFor(() => {
        const state = useEditorStore.getState() as ReturnType<typeof useEditorStore.getState> & {
          activeMediaAssetPreview?: { publicPath: string } | null
        }
        expect(state.codeEditorPanelOpen).toBe(true)
        expect(state.activeEditorFileId).toBeNull()
        expect(state.activeMediaAssetPreview?.publicPath).toBe('/uploads/hero.png')
      })
      expect(openCalls).toHaveLength(0)
      expect(screen.getByLabelText('Image preview: hero.png')).toBeDefined()
    } finally {
      globalThis.fetch = originalFetch
      window.open = originalOpen
    }
  })

  it('opens pages and components on the canvas from concept rows', () => {
    loadProject()
    render(<ProjectExplorerPanel variant="docked" />)

    fireEvent.click(screen.getByRole('button', { name: /open page pricing/i }))
    expect(useEditorStore.getState().activePageId).toBe('page-pricing')
    expect(useEditorStore.getState().activeDocument).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /open component herocard/i }))
    expect(useEditorStore.getState().activeDocument).toEqual({
      kind: 'visualComponent',
      vcId: 'vc-HeroCard',
    })
  })

  it('creates pages through the simple project dialog', () => {
    loadProject()
    render(<ProjectExplorerPanel variant="docked" />)

    fireEvent.click(screen.getByRole('button', { name: 'New page' }))

    const dialog = screen.getByRole('dialog', { name: 'New page' })
    expect(within(dialog).queryByText(/src\/pages/i)).toBeNull()
    expect(within(dialog).queryByText(/home\.tsx/i)).toBeNull()

    fireEvent.change(within(dialog).getByLabelText('Name'), {
      target: { value: 'About Us' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }))

    const state = useEditorStore.getState()
    const created = state.project?.pages.find((page) => page.title === 'About Us')
    expect(created?.slug).toBe('about-us')
    expect(state.activePageId).toBe(created?.id)
    expect(state.activeDocument).toBeNull()
    expect(screen.queryByRole('dialog', { name: 'New page' })).toBeNull()
  })

  it('creates components through the simple project dialog', () => {
    loadProject()
    render(<ProjectExplorerPanel variant="docked" />)

    fireEvent.click(screen.getByRole('button', { name: 'New component' }))

    const dialog = screen.getByRole('dialog', { name: 'New component' })
    expect(within(dialog).queryByText(/src\/components/i)).toBeNull()

    fireEvent.change(within(dialog).getByLabelText('Name'), {
      target: { value: 'feature row' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }))

    const state = useEditorStore.getState()
    const created = state.project?.visualComponents.find((component) => component.name === 'FeatureRow')
    expect(created).toBeDefined()
    expect(state.activeDocument).toEqual({
      kind: 'visualComponent',
      vcId: created?.id,
    })
  })

  it('creates styles and scripts through the simple project dialog', () => {
    loadProject()
    render(<ProjectExplorerPanel variant="docked" />)

    fireEvent.click(screen.getByRole('button', { name: 'New stylesheet' }))
    let dialog = screen.getByRole('dialog', { name: 'New stylesheet' })
    fireEvent.change(within(dialog).getByLabelText('Name'), {
      target: { value: 'landing' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }))

    let state = useEditorStore.getState()
    const styleFile = state.project?.files.find((file) => file.path === 'src/styles/landing.css')
    expect(styleFile?.type).toBe('style')
    expect(state.activeEditorFileId).toBe(styleFile?.id)

    fireEvent.click(screen.getByRole('button', { name: 'New script' }))
    dialog = screen.getByRole('dialog', { name: 'New script' })
    fireEvent.change(within(dialog).getByLabelText('Name'), {
      target: { value: 'tracking' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }))

    state = useEditorStore.getState()
    const scriptFile = state.project?.files.find((file) => file.path === 'src/scripts/tracking.ts')
    expect(scriptFile?.type).toBe('script')
    expect(state.activeEditorFileId).toBe(scriptFile?.id)
  })
})
