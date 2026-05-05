/**
 * Browser-side executor tests.
 *
 * The executor receives `toolRequest` stream events from the server and
 * applies the corresponding mutation against the live editor store.
 * Each tool call is its own atomic mutation — no batch semantics, no
 * cross-call refs (Claude uses real returned IDs in subsequent tool calls).
 *
 * Constraint #272 — every input is validated with TypeBox before dispatch.
 * Constraint #299 — richtext props are sanitized via DOMPurify before storage.
 */

import { describe, it, expect } from 'bun:test'
import { useEditorStore } from '@core/editor-store/store'
import { executeAgentTool } from '@core/agent/executor'
import '../../modules/base'

// ---------------------------------------------------------------------------
// Store reset helper
// ---------------------------------------------------------------------------

function freshStore() {
  useEditorStore.setState({
    site: null,
    _historyPast: [],
    _historyFuture: [],
    canUndo: false,
    canRedo: false,
    selectedNodeId: null,
    hoveredNodeId: null,
    activeClassId: null,
    isAgentOpen: false,
    isAgentStreaming: false,
    agentMessages: [],
    agentError: null,
    hasUnsavedChanges: false,
  })
  const s = useEditorStore.getState()
  const site = s.createSite('Test')
  const rootId = site.pages[0].rootNodeId
  return { rootId, store: useEditorStore.getState() }
}

// ---------------------------------------------------------------------------
// insertNode
// ---------------------------------------------------------------------------

describe('executeAgentTool — insertNode', () => {
  it('inserts a node and returns success + nodeId', async () => {
    const { rootId } = freshStore()
    const result = await executeAgentTool('insertNode', {
      moduleId: 'base.text',
      parentId: rootId,
      props: { text: 'Hello', tag: 'h1' },
    })
    expect(result.success).toBe(true)
    expect(result.nodeId).toBeTruthy()
    const page = useEditorStore.getState().site!.pages[0]
    expect(Object.values(page.nodes).some((n) => n.moduleId === 'base.text')).toBe(true)
  })

  it('merges module defaults when the agent omits props', async () => {
    const { rootId } = freshStore()
    const result = await executeAgentTool('insertNode', {
      moduleId: 'base.container',
      parentId: rootId,
      props: {},
    })

    expect(result.success).toBe(true)
    const page = useEditorStore.getState().site!.pages[0]
    const node = page.nodes[result.nodeId!]
    expect(node.props.tag).toBe('div')
  })

  it('lets agent props override module defaults after merging defaults', async () => {
    const { rootId } = freshStore()
    const result = await executeAgentTool('insertNode', {
      moduleId: 'base.container',
      parentId: rootId,
      props: { tag: 'section' },
    })

    expect(result.success).toBe(true)
    const page = useEditorStore.getState().site!.pages[0]
    const node = page.nodes[result.nodeId!]
    expect(node.props.tag).toBe('section')
  })

  it('appends to parent children without index', async () => {
    const { rootId } = freshStore()
    await executeAgentTool('insertNode', { moduleId: 'base.text', parentId: rootId })
    await executeAgentTool('insertNode', { moduleId: 'base.button', parentId: rootId })
    const page = useEditorStore.getState().site!.pages[0]
    const root = page.nodes[rootId]
    expect(root.children).toHaveLength(2)
  })

  it('returns failure for invalid params (missing moduleId)', async () => {
    const { rootId } = freshStore()
    const result = await executeAgentTool('insertNode', {
      moduleId: '',
      parentId: rootId,
    })
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('returns failure for module IDs that are not registered', async () => {
    const { rootId } = freshStore()
    const result = await executeAgentTool('insertNode', {
      moduleId: 'missing.module',
      parentId: rootId,
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Module not found')
  })

  it('rejects insertNode that references an unknown class', async () => {
    const { rootId } = freshStore()
    const result = await executeAgentTool('insertNode', {
      moduleId: 'base.text',
      parentId: rootId,
      classIds: ['no-such-class'],
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Class not found')
  })
})

// ---------------------------------------------------------------------------
// deleteNode
// ---------------------------------------------------------------------------

describe('executeAgentTool — deleteNode', () => {
  it('deletes a node successfully', async () => {
    const { rootId } = freshStore()
    const insertResult = await executeAgentTool('insertNode', {
      moduleId: 'base.text', parentId: rootId,
    })
    const nodeId = insertResult.nodeId!

    const deleteResult = await executeAgentTool('deleteNode', { nodeId })
    expect(deleteResult.success).toBe(true)

    const page = useEditorStore.getState().site!.pages[0]
    expect(page.nodes[nodeId]).toBeUndefined()
  })

  it('fails with empty nodeId', async () => {
    freshStore()
    const result = await executeAgentTool('deleteNode', { nodeId: '' })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// updateNodeProps
// ---------------------------------------------------------------------------

describe('executeAgentTool — updateNodeProps', () => {
  it('patches node props', async () => {
    const { rootId } = freshStore()
    const { nodeId } = await executeAgentTool('insertNode', {
      moduleId: 'base.text', parentId: rootId, props: { text: 'Old' },
    })
    await executeAgentTool('updateNodeProps', { nodeId: nodeId!, patch: { text: 'New' } })
    const page = useEditorStore.getState().site!.pages[0]
    expect(page.nodes[nodeId!].props.text).toBe('New')
  })

  it('can target a configured breakpoint without changing base props', async () => {
    const { rootId } = freshStore()
    const { nodeId } = await executeAgentTool('insertNode', {
      moduleId: 'base.text',
      parentId: rootId,
      props: { text: 'Desktop copy' },
    })

    const result = await executeAgentTool('updateNodeProps', {
      nodeId: nodeId!,
      breakpointId: 'mobile',
      patch: { text: 'Mobile copy' },
    })

    expect(result.success).toBe(true)
    const page = useEditorStore.getState().site!.pages[0]
    expect(page.nodes[nodeId!].props.text).toBe('Desktop copy')
    expect(page.nodes[nodeId!].breakpointOverrides.mobile.text).toBe('Mobile copy')
  })

  it('rejects updateNodeProps targeting an unknown breakpoint', async () => {
    const { rootId } = freshStore()
    const { nodeId } = await executeAgentTool('insertNode', {
      moduleId: 'base.text',
      parentId: rootId,
    })

    const result = await executeAgentTool('updateNodeProps', {
      nodeId: nodeId!,
      breakpointId: 'watch',
      patch: { text: 'Smaller' },
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Breakpoint not found')
  })
})

// ---------------------------------------------------------------------------
// moveNode
// ---------------------------------------------------------------------------

describe('executeAgentTool — moveNode', () => {
  it('moves a node to a new parent', async () => {
    const { rootId } = freshStore()
    const c1 = (await executeAgentTool('insertNode', { moduleId: 'base.container', parentId: rootId })).nodeId!
    const c2 = (await executeAgentTool('insertNode', { moduleId: 'base.container', parentId: rootId })).nodeId!
    const child = (await executeAgentTool('insertNode', { moduleId: 'base.text', parentId: c1 })).nodeId!
    const result = await executeAgentTool('moveNode', { nodeId: child, newParentId: c2, newIndex: 0 })
    expect(result.success).toBe(true)
    const page = useEditorStore.getState().site!.pages[0]
    expect(page.nodes[c2].children).toContain(child)
    expect(page.nodes[c1].children).not.toContain(child)
  })
})

// ---------------------------------------------------------------------------
// renameNode
// ---------------------------------------------------------------------------

describe('executeAgentTool — renameNode', () => {
  it('sets the node label', async () => {
    const { rootId } = freshStore()
    const { nodeId } = await executeAgentTool('insertNode', { moduleId: 'base.text', parentId: rootId })
    await executeAgentTool('renameNode', { nodeId: nodeId!, label: 'Hero Heading' })
    const page = useEditorStore.getState().site!.pages[0]
    expect(page.nodes[nodeId!].label).toBe('Hero Heading')
  })
})

// ---------------------------------------------------------------------------
// createClass
// ---------------------------------------------------------------------------

describe('executeAgentTool — createClass', () => {
  it('creates a class and returns its ID in nodeId field', async () => {
    freshStore()
    const result = await executeAgentTool('createClass', {
      name: 'btn-primary', styles: { fontSize: '14px' },
    })
    expect(result.success).toBe(true)
    expect(result.nodeId).toBeTruthy()
    const classes = useEditorStore.getState().site!.classes
    expect(Object.values(classes).some((c) => c.name === 'btn-primary')).toBe(true)
  })

  it('fails when class name is empty', async () => {
    freshStore()
    const result = await executeAgentTool('createClass', { name: '' })
    expect(result.success).toBe(false)
  })

  it('creates a class with breakpoint-specific styles', async () => {
    freshStore()
    const result = await executeAgentTool('createClass', {
      name: 'responsive-heading',
      styles: { fontSize: '64px', lineHeight: '1' },
      breakpointStyles: {
        mobile: { fontSize: '40px', lineHeight: '1.05' },
      },
    })

    expect(result.success).toBe(true)
    const cls = useEditorStore.getState().site!.classes[result.nodeId!]
    expect(cls.styles.fontSize).toBe('64px')
    expect(cls.breakpointStyles.mobile.fontSize).toBe('40px')
    expect(cls.breakpointStyles.mobile.lineHeight).toBe('1.05')
  })
})

// ---------------------------------------------------------------------------
// assignClass / removeClass
// ---------------------------------------------------------------------------

describe('executeAgentTool — assignClass / removeClass', () => {
  it('assigns a class to a node', async () => {
    const { rootId } = freshStore()
    const { nodeId } = await executeAgentTool('insertNode', { moduleId: 'base.text', parentId: rootId })
    const classResult = await executeAgentTool('createClass', { name: 'highlighted' })
    const classId = classResult.nodeId!

    await executeAgentTool('assignClass', { nodeId: nodeId!, classId })
    const page = useEditorStore.getState().site!.pages[0]
    expect(page.nodes[nodeId!].classIds).toContain(classId)
  })

  it('removes a class from a node', async () => {
    const { rootId } = freshStore()
    const { nodeId } = await executeAgentTool('insertNode', { moduleId: 'base.text', parentId: rootId })
    const classResult = await executeAgentTool('createClass', { name: 'highlighted2' })
    const classId = classResult.nodeId!

    await executeAgentTool('assignClass', { nodeId: nodeId!, classId })
    await executeAgentTool('removeClass', { nodeId: nodeId!, classId })
    const page = useEditorStore.getState().site!.pages[0]
    expect(page.nodes[nodeId!].classIds ?? []).not.toContain(classId)
  })
})

// ---------------------------------------------------------------------------
// Class identifiers — name vs id resolution
// ---------------------------------------------------------------------------

describe('executeAgentTool — class identifier resolution', () => {
  it('resolves classId by name in assignClass', async () => {
    const { rootId } = freshStore()
    const { nodeId } = await executeAgentTool('insertNode', { moduleId: 'base.button', parentId: rootId })
    await executeAgentTool('createClass', { name: 'btn-hero', styles: { color: '#fff' } })

    const result = await executeAgentTool('assignClass', { nodeId: nodeId!, classId: 'btn-hero' })
    expect(result.success).toBe(true)

    const page = useEditorStore.getState().site!.pages[0]
    const classes = useEditorStore.getState().site!.classes
    const heroClass = Object.values(classes).find((c) => c.name === 'btn-hero')!
    expect(page.nodes[nodeId!].classIds).toContain(heroClass.id)
  })

  it('returns failure when classId / name does not match any class', async () => {
    const { rootId } = freshStore()
    const { nodeId } = await executeAgentTool('insertNode', { moduleId: 'base.button', parentId: rootId })
    const result = await executeAgentTool('assignClass', { nodeId: nodeId!, classId: 'nonexistent-class' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('nonexistent-class')
  })

  it('removeClass also resolves by name', async () => {
    const { rootId } = freshStore()
    const { nodeId } = await executeAgentTool('insertNode', { moduleId: 'base.button', parentId: rootId })
    await executeAgentTool('createClass', { name: 'removable' })
    await executeAgentTool('assignClass', { nodeId: nodeId!, classId: 'removable' })

    const result = await executeAgentTool('removeClass', { nodeId: nodeId!, classId: 'removable' })
    expect(result.success).toBe(true)

    const page = useEditorStore.getState().site!.pages[0]
    const classes = useEditorStore.getState().site!.classes
    const cls = Object.values(classes).find((c) => c.name === 'removable')!
    expect(page.nodes[nodeId!].classIds ?? []).not.toContain(cls.id)
  })

  it('updateClassStyles resolves by name', async () => {
    freshStore()
    await executeAgentTool('createClass', { name: 'card', styles: { padding: '8px' } })

    const result = await executeAgentTool('updateClassStyles', {
      classId: 'card',
      patch: { padding: '16px', borderRadius: '4px' },
    })
    expect(result.success).toBe(true)

    const classes = useEditorStore.getState().site!.classes
    const cls = Object.values(classes).find((c) => c.name === 'card')!
    expect(cls.styles.padding).toBe('16px')
    expect(cls.styles.borderRadius).toBe('4px')
  })

  it('updateClassStyles can target a configured breakpoint without changing base styles', async () => {
    freshStore()
    await executeAgentTool('createClass', { name: 'responsive-card', styles: { display: 'grid', gridTemplateColumns: '1fr 1fr' } })

    const result = await executeAgentTool('updateClassStyles', {
      classId: 'responsive-card',
      breakpointId: 'mobile',
      patch: { gridTemplateColumns: '1fr', gap: '16px' },
    })
    expect(result.success).toBe(true)

    const classes = useEditorStore.getState().site!.classes
    const cls = Object.values(classes).find((c) => c.name === 'responsive-card')!
    expect(cls.styles.gridTemplateColumns).toBe('1fr 1fr')
    expect(cls.breakpointStyles.mobile.gridTemplateColumns).toBe('1fr')
    expect(cls.breakpointStyles.mobile.gap).toBe('16px')
  })

  it('fails when updateClassStyles targets an unknown breakpoint', async () => {
    freshStore()
    await executeAgentTool('createClass', { name: 'responsive-card', styles: { padding: '24px' } })

    const result = await executeAgentTool('updateClassStyles', {
      classId: 'responsive-card',
      breakpointId: 'watch',
      patch: { padding: '12px' },
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Breakpoint not found')

    const cls = Object.values(useEditorStore.getState().site!.classes).find((c) => c.name === 'responsive-card')!
    expect(cls.styles.padding).toBe('24px')
    expect(cls.breakpointStyles.watch).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// addPage
// ---------------------------------------------------------------------------

describe('executeAgentTool — addPage', () => {
  it('adds a page to the site', async () => {
    freshStore()
    const result = await executeAgentTool('addPage', { title: 'About', slug: 'about' })
    expect(result.success).toBe(true)
    const pages = useEditorStore.getState().site!.pages
    expect(pages.some((p) => p.title === 'About')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// updateNodeProps — richtext sanitization (Constraint #299 / security)
// ---------------------------------------------------------------------------

describe('executeAgentTool — updateNodeProps richtext sanitization (Constraint #299)', () => {
  it('strips <script> from a richtext prop updated via the agent', async () => {
    const { rootId } = freshStore()
    const { nodeId } = await executeAgentTool('insertNode', {
      moduleId: 'base.text', parentId: rootId,
    })
    await executeAgentTool('updateNodeProps', {
      nodeId: nodeId!,
      patch: { richtext: '<p>Hello</p><script>alert(1)</script>' },
    })
    const page = useEditorStore.getState().site!.pages[0]
    const stored = page.nodes[nodeId!].props.richtext as string
    expect(stored).not.toContain('<script>')
    expect(stored).not.toContain('alert(1)')
    expect(stored).toContain('Hello')
  })

  it('strips onerror attribute from richtext prop via agent updateNodeProps', async () => {
    const { rootId } = freshStore()
    const { nodeId } = await executeAgentTool('insertNode', {
      moduleId: 'base.text', parentId: rootId,
    })
    await executeAgentTool('updateNodeProps', {
      nodeId: nodeId!,
      patch: { richtext: '<img src=x onerror=alert(1)>' },
    })
    const page = useEditorStore.getState().site!.pages[0]
    const stored = page.nodes[nodeId!].props.richtext as string
    expect(stored).not.toContain('onerror')
    expect(stored).not.toContain('alert(1)')
  })

  it('strips javascript: href from richtext prop via agent updateNodeProps', async () => {
    const { rootId } = freshStore()
    const { nodeId } = await executeAgentTool('insertNode', {
      moduleId: 'base.text', parentId: rootId,
    })
    await executeAgentTool('updateNodeProps', {
      nodeId: nodeId!,
      patch: { bodyHtml: '<a href="javascript:alert(1)">click</a>' },
    })
    const page = useEditorStore.getState().site!.pages[0]
    const stored = page.nodes[nodeId!].props.bodyHtml as string
    expect(stored).not.toContain('javascript:')
  })

  it('preserves safe HTML in richtext prop via agent updateNodeProps', async () => {
    const { rootId } = freshStore()
    const { nodeId } = await executeAgentTool('insertNode', {
      moduleId: 'base.text', parentId: rootId,
    })
    const safeHtml = '<p><strong>Bold</strong> and <em>italic</em></p>'
    await executeAgentTool('updateNodeProps', {
      nodeId: nodeId!,
      patch: { richtext: safeHtml },
    })
    const page = useEditorStore.getState().site!.pages[0]
    const stored = page.nodes[nodeId!].props.richtext as string
    expect(stored).toContain('Bold')
    expect(stored).toContain('italic')
  })

  it('plain (non-richtext-keyed) props are NOT sanitized by DOMPurify', async () => {
    const { rootId } = freshStore()
    const { nodeId } = await executeAgentTool('insertNode', {
      moduleId: 'base.text', parentId: rootId,
    })
    await executeAgentTool('updateNodeProps', {
      nodeId: nodeId!,
      patch: { text: 'Cats & Dogs' },
    })
    const page = useEditorStore.getState().site!.pages[0]
    expect(page.nodes[nodeId!].props.text).toBe('Cats & Dogs')
  })
})

describe('executeAgentTool — insertNode richtext sanitization (Constraint #299)', () => {
  it('sanitizes richtext prop in initial props during insertNode', async () => {
    const { rootId } = freshStore()
    const result = await executeAgentTool('insertNode', {
      moduleId: 'base.text',
      parentId: rootId,
      props: { richtext: '<p>Hello</p><script>alert(1)</script>' },
    })
    expect(result.success).toBe(true)
    const page = useEditorStore.getState().site!.pages[0]
    const stored = page.nodes[result.nodeId!].props.richtext as string
    expect(stored).not.toContain('<script>')
    expect(stored).toContain('Hello')
  })
})

// ---------------------------------------------------------------------------
// insertTree — nested tree + supporting classes in one call
// ---------------------------------------------------------------------------

describe('executeAgentTool — insertTree', () => {
  it('inserts a styled nested tree in one call', async () => {
    const { rootId } = freshStore()
    const result = await executeAgentTool('insertTree', {
      parentId: rootId,
      classes: [
        {
          name: 'agent-hero',
          styles: {
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
            paddingTop: '80px',
            paddingRight: '64px',
            paddingBottom: '80px',
            paddingLeft: '64px',
            backgroundColor: '#111827',
            color: '#ffffff',
          },
        },
        {
          name: 'agent-hero-title',
          styles: {
            fontSize: '56px',
            lineHeight: '1.05',
            fontWeight: '700',
            color: '#ffffff',
          },
          breakpointStyles: {
            mobile: {
              fontSize: '40px',
              lineHeight: '1.08',
            },
          },
        },
        {
          name: 'agent-cta',
          styles: {
            width: 'fit-content',
            paddingTop: '12px',
            paddingRight: '18px',
            paddingBottom: '12px',
            paddingLeft: '18px',
            borderRadius: '8px',
            backgroundColor: '#ffffff',
            color: '#111827',
          },
        },
      ],
      tree: {
        moduleId: 'base.container',
        props: { tag: 'section' },
        classIds: ['agent-hero'],
        children: [
          {
            moduleId: 'base.text',
            props: { tag: 'h1', text: 'Designed with intent' },
            classIds: ['agent-hero-title'],
          },
          {
            moduleId: 'base.button',
            props: { label: 'Start a site' },
            classIds: ['agent-cta'],
          },
        ],
      },
    })

    expect(result.success).toBe(true)

    const state = useEditorStore.getState()
    const page = state.site!.pages[0]
    const heroId = result.nodeId!
    const hero = page.nodes[heroId]
    const title = page.nodes[hero.children[0]]
    const classes = Object.values(state.site!.classes)
    const heroClass = classes.find((c) => c.name === 'agent-hero')
    const titleClass = classes.find((c) => c.name === 'agent-hero-title')
    const ctaClass = classes.find((c) => c.name === 'agent-cta')

    expect(hero.children).toHaveLength(2)
    expect(hero.classIds).toContain(heroClass!.id)
    expect(title.classIds).toContain(titleClass!.id)
    expect(heroClass?.styles.backgroundColor).toBe('#111827')
    expect(titleClass?.styles.fontSize).toBe('56px')
    expect(titleClass?.breakpointStyles.mobile.fontSize).toBe('40px')
    expect(ctaClass?.styles.backgroundColor).toBe('#ffffff')
  })

  it('rejects insertTree referencing an unknown class name', async () => {
    const { rootId } = freshStore()
    const result = await executeAgentTool('insertTree', {
      parentId: rootId,
      tree: {
        moduleId: 'base.text',
        props: { tag: 'h1', text: 'Simple page' },
        classIds: ['agent-title'],
      },
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Class')
  })
})

// ---------------------------------------------------------------------------
// Unknown tool names
// ---------------------------------------------------------------------------

describe('executeAgentTool — unknown tool name', () => {
  it('returns success: false for tool names the executor does not recognise', async () => {
    freshStore()
    const result = await executeAgentTool('not-a-real-tool', {})
    expect(result.success).toBe(false)
    expect(result.error).toContain('Unknown')
  })
})
