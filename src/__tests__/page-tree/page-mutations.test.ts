/**
 * Page-level mutation tests — addPage, deletePage, renamePage, reorderPages
 *
 * These functions operate on a `Project` draft (not a single `Page`).
 * They were at 0% coverage after the initial scaffold.
 * Required before J5 (canvas) ships — the project store calls these.
 */

import { describe, it, expect } from 'bun:test'
import { produce } from 'immer'
import type { Project } from '../../core/page-tree/types'
import {
  addPage,
  deletePage,
  renamePage,
  reorderPages,
} from '../../core/page-tree/mutations'
import { createUniquePageSlug } from '../../core/page-tree/slugs'
import { makeProject, makePage } from '../fixtures'

// ---------------------------------------------------------------------------
// addPage
// ---------------------------------------------------------------------------

describe('addPage', () => {
  it('adds a new page to the project', () => {
    const project = makeProject({ pages: [makePage()] })
    addPage(project, 'About', 'about')
    expect(project.pages).toHaveLength(2)
  })

  it('returns the newly created Page', () => {
    const project = makeProject({ pages: [] })
    const page = addPage(project, 'Contact', 'contact')
    expect(page.title).toBe('Contact')
    expect(page.slug).toBe('contact')
    expect(page.rootNodeId).toBeTruthy()
    expect(Object.keys(page.nodes)).toHaveLength(1) // root node only
  })

  it('slug is lowercased and sanitised', () => {
    const project = makeProject({ pages: [] })
    const page = addPage(project, 'Our Services', 'Our Services Page!')
    // Special chars removed, spaces → dashes, lowercased
    expect(page.slug).not.toContain(' ')
    expect(page.slug).not.toContain('!')
    expect(page.slug).toBe(page.slug.toLowerCase())
  })

  it('creates a unique root node for each page', () => {
    const project = makeProject({ pages: [] })
    const p1 = addPage(project, 'Home', 'index')
    const p2 = addPage(project, 'About', 'about')
    expect(p1.rootNodeId).not.toBe(p2.rootNodeId)
  })

  it('root node is in the page nodes map', () => {
    const project = makeProject({ pages: [] })
    const page = addPage(project, 'Home', 'index')
    expect(page.nodes[page.rootNodeId]).toBeDefined()
    expect(page.nodes[page.rootNodeId].moduleId).toBe('base.root')
  })

  it('page is added at the end of project.pages array', () => {
    const project = makeProject({ pages: [makePage({ slug: 'existing' })] })
    addPage(project, 'New', 'new-page')
    expect(project.pages[project.pages.length - 1].slug).toBe('new-page')
  })

  it('generates slugs that avoid reserved public routes', () => {
    const project = makeProject({ pages: [] })
    expect(createUniquePageSlug('Admin', project.pages)).toBe('admin-page')
  })

  it('generates slugs that avoid existing page slugs', () => {
    const project = makeProject({ pages: [makePage({ slug: 'about' })] })
    expect(createUniquePageSlug('About', project.pages)).toBe('about-2')
  })

  it('is Immer-safe — produce() works with addPage', () => {
    const project = makeProject({ pages: [makePage()] })
    const originalCount = project.pages.length

    const nextProject = produce(project, (draft) => {
      addPage(draft, 'Immer Test', 'immer-test')
    })

    expect(project.pages).toHaveLength(originalCount) // original unchanged
    expect(nextProject.pages).toHaveLength(originalCount + 1)
  })
})

// ---------------------------------------------------------------------------
// deletePage
// ---------------------------------------------------------------------------

describe('deletePage', () => {
  it('removes a page by id', () => {
    const pageA = makePage({ id: 'page-a', slug: 'a' })
    const pageB = makePage({ id: 'page-b', slug: 'b' })
    const project = makeProject({ pages: [pageA, pageB] })

    deletePage(project, 'page-a')
    expect(project.pages).toHaveLength(1)
    expect(project.pages[0].id).toBe('page-b')
  })

  it('throws when trying to delete the last page', () => {
    const project = makeProject({ pages: [makePage()] })
    expect(() => deletePage(project, project.pages[0].id)).toThrow()
  })

  it('is a no-op for non-existent page id (does not throw)', () => {
    const project = makeProject({ pages: [makePage(), makePage({ id: 'page-2', slug: 'b' })] })
    expect(() => deletePage(project, 'nonexistent-id')).not.toThrow()
    expect(project.pages).toHaveLength(2)
  })

  it('is Immer-safe', () => {
    const p1 = makePage({ id: 'p1', slug: 'p1' })
    const p2 = makePage({ id: 'p2', slug: 'p2' })
    const project = makeProject({ pages: [p1, p2] })

    const nextProject = produce(project, (draft) => {
      deletePage(draft, 'p1')
    })

    expect(project.pages).toHaveLength(2) // original unchanged
    expect(nextProject.pages).toHaveLength(1)
    expect(nextProject.pages[0].id).toBe('p2')
  })
})

// ---------------------------------------------------------------------------
// renamePage
// ---------------------------------------------------------------------------

describe('renamePage', () => {
  it('updates the page title', () => {
    const page = makePage({ id: 'page-1', title: 'Old Title' })
    const project = makeProject({ pages: [page] })

    renamePage(project, 'page-1', 'New Title')
    expect(project.pages[0].title).toBe('New Title')
  })

  it('throws when page does not exist', () => {
    const project = makeProject({ pages: [makePage()] })
    expect(() => renamePage(project, 'nonexistent', 'Title')).toThrow()
  })

  it('accepts an empty title (edge case — validation is UI responsibility)', () => {
    const page = makePage({ id: 'p1' })
    const project = makeProject({ pages: [page] })
    expect(() => renamePage(project, 'p1', '')).not.toThrow()
    expect(project.pages[0].title).toBe('')
  })

  it('is Immer-safe', () => {
    const page = makePage({ id: 'p1', title: 'Original' })
    const project = makeProject({ pages: [page] })

    const nextProject = produce(project, (draft) => {
      renamePage(draft, 'p1', 'Updated')
    })

    expect(project.pages[0].title).toBe('Original') // original unchanged
    expect(nextProject.pages[0].title).toBe('Updated')
  })
})

// ---------------------------------------------------------------------------
// reorderPages
// ---------------------------------------------------------------------------

describe('reorderPages', () => {
  function makeProjectWithPages(ids: string[]): Project {
    const pages = ids.map((id) => makePage({ id, slug: id }))
    return makeProject({ pages })
  }

  it('moves a page from one index to another', () => {
    const project = makeProjectWithPages(['a', 'b', 'c'])
    reorderPages(project, 0, 2) // move 'a' to end
    expect(project.pages.map((p) => p.id)).toEqual(['b', 'c', 'a'])
  })

  it('moves a page to the beginning', () => {
    const project = makeProjectWithPages(['a', 'b', 'c'])
    reorderPages(project, 2, 0) // move 'c' to front
    expect(project.pages.map((p) => p.id)).toEqual(['c', 'a', 'b'])
  })

  it('reordering adjacent pages works correctly', () => {
    const project = makeProjectWithPages(['a', 'b', 'c'])
    reorderPages(project, 0, 1) // swap first two
    expect(project.pages.map((p) => p.id)).toEqual(['b', 'a', 'c'])
  })

  it('reordering from same index to same index is a no-op', () => {
    const project = makeProjectWithPages(['a', 'b', 'c'])
    reorderPages(project, 1, 1)
    expect(project.pages.map((p) => p.id)).toEqual(['a', 'b', 'c'])
  })

  it('is Immer-safe', () => {
    const project = makeProjectWithPages(['a', 'b', 'c'])

    const nextProject = produce(project, (draft) => {
      reorderPages(draft, 0, 2)
    })

    expect(project.pages.map((p) => p.id)).toEqual(['a', 'b', 'c']) // unchanged
    expect(nextProject.pages.map((p) => p.id)).toEqual(['b', 'c', 'a'])
  })
})
