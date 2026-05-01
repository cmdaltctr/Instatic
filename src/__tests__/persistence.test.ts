/**
 * Persistence tests — validateProject (Constraint #230)
 *
 * The persistence adapter requires IndexedDB so cannot be tested in bun test.
 * These tests cover the pure validation layer, which is the most critical
 * safety gate (Constraint #230: validate before store hydration).
 */

import { describe, it, expect } from 'bun:test'
import { validateProject, ValidationError } from '../core/persistence/validate'
import type { Project } from '../core/page-tree/types'

// ── Helpers ─────────────────────────────────────────────────────────────────

function validProject(): Project {
  return {
    id: 'proj-1',
    name: 'Test Project',
    projectMode: 'html',
    createdAt: 1000,
    updatedAt: 2000,
    files: [],
    classes: {},
    breakpoints: [
      { id: 'desktop', label: 'Desktop', width: 1440, icon: 'monitor' },
    ],
    settings: {
      colorTokens: {},
      typeScale: { baseSize: 16, ratio: 1.25 },
      shortcuts: {},
    },
    pages: [
      {
        id: 'page-1',
        title: 'Home',
        slug: 'index',
        rootNodeId: 'root',
        nodes: {
          root: {
            id: 'root',
            moduleId: 'base.root',
            props: {},
            children: ['heading-1'],
            breakpointOverrides: {},
          },
          'heading-1': {
            id: 'heading-1',
            moduleId: 'base.heading',
            props: { text: 'Hello' },
            children: [],
            breakpointOverrides: { mobile: { text: 'Hi' } },
          },
        },
      },
    ],
  }
}

// ── Happy path ───────────────────────────────────────────────────────────────

describe('validateProject — happy path', () => {
  it('accepts a valid project and returns a typed Project', () => {
    const input = validProject()
    const result = validateProject(input)
    expect(result.id).toBe('proj-1')
    expect(result.name).toBe('Test Project')
    expect(result.pages).toHaveLength(1)
    expect(result.pages[0].nodes['heading-1'].props.text).toBe('Hello')
  })

  it('preserves breakpoint overrides on nodes', () => {
    const result = validateProject(validProject())
    expect(result.pages[0].nodes['heading-1'].breakpointOverrides.mobile).toEqual({ text: 'Hi' })
  })

  it('preserves optional fields (label, locked, hidden) when present', () => {
    const p = validProject()
    p.pages[0].nodes.root.label = 'My Root'
    p.pages[0].nodes.root.locked = true
    p.pages[0].nodes.root.hidden = false
    const result = validateProject(p)
    expect(result.pages[0].nodes.root.label).toBe('My Root')
    expect(result.pages[0].nodes.root.locked).toBe(true)
    expect(result.pages[0].nodes.root.hidden).toBe(false)
  })

  it('omits optional fields when absent', () => {
    const result = validateProject(validProject())
    expect(result.pages[0].nodes.root.label).toBeUndefined()
    expect(result.pages[0].nodes.root.locked).toBeUndefined()
  })

  it('accepts settings with all optional fields', () => {
    const p = validProject()
    p.settings.language = 'fr'
    p.settings.metaTitle = 'My Site'
    const result = validateProject(p)
    expect(result.settings.language).toBe('fr')
    expect(result.settings.metaTitle).toBe('My Site')
  })

  it('fills defaults for missing settings sub-fields', () => {
    const p = validProject()
    // @ts-expect-error — intentionally malformed
    delete p.settings.typeScale
    const result = validateProject(p as unknown)
    expect(result.settings.typeScale.baseSize).toBe(16)
    expect(result.settings.typeScale.ratio).toBe(1.25)
  })

  it('ignores unknown extra keys (forward-compat)', () => {
    const p = { ...validProject(), _futureField: 'foo' }
    expect(() => validateProject(p)).not.toThrow()
  })
})

// ── Structural errors ────────────────────────────────────────────────────────

describe('validateProject — rejects invalid data', () => {
  it('throws ValidationError for null', () => {
    expect(() => validateProject(null)).toThrow(ValidationError)
  })

  it('throws for missing project.id', () => {
    const p = validProject() as Record<string, unknown>
    delete p.id
    expect(() => validateProject(p)).toThrow(ValidationError)
    try { validateProject(p) } catch (e) {
      expect((e as ValidationError).path).toBe('project.id')
    }
  })

  it('throws for non-string project.name', () => {
    const p = { ...validProject(), name: 42 }
    expect(() => validateProject(p as unknown)).toThrow(ValidationError)
  })

  it('throws for non-array project.pages', () => {
    const p = { ...validProject(), pages: 'not-an-array' }
    expect(() => validateProject(p as unknown)).toThrow(ValidationError)
  })

  it('throws for empty pages array', () => {
    const p = { ...validProject(), pages: [] }
    expect(() => validateProject(p as unknown)).toThrow(ValidationError)
    try { validateProject(p as unknown) } catch (e) {
      expect((e as ValidationError).path).toBe('project.pages')
    }
  })

  it('throws when rootNodeId is missing from nodes', () => {
    const p = validProject()
    p.pages[0].rootNodeId = 'nonexistent-id'
    expect(() => validateProject(p)).toThrow(ValidationError)
    try { validateProject(p) } catch (e) {
      expect((e as ValidationError).path).toBe('project.pages[0].rootNodeId')
    }
  })

  it('throws for invalid public page slugs', () => {
    const p = validProject()
    p.pages[0].slug = 'About Us'

    expect(() => validateProject(p)).toThrow(ValidationError)
    try { validateProject(p) } catch (e) {
      expect((e as ValidationError).path).toBe('project.pages[0].slug')
    }
  })

  it('throws for reserved public page slugs', () => {
    const p = validProject()
    p.pages[0].slug = 'admin'

    expect(() => validateProject(p)).toThrow(ValidationError)
    try { validateProject(p) } catch (e) {
      expect((e as ValidationError).message).toContain('reserved')
    }
  })

  it('throws for duplicate public page slugs', () => {
    const p = validProject()
    p.pages.push({ ...structuredClone(p.pages[0]), id: 'page-2', title: 'Duplicate Home' })

    expect(() => validateProject(p)).toThrow(ValidationError)
    try { validateProject(p) } catch (e) {
      expect((e as ValidationError).message).toContain('duplicate slug')
    }
  })

  it('throws for non-array node.children', () => {
    const p = validProject()
    ;(p.pages[0].nodes.root as Record<string, unknown>).children = 'bad'
    expect(() => validateProject(p as unknown)).toThrow(ValidationError)
  })

  it('throws for non-numeric createdAt', () => {
    const p = { ...validProject(), createdAt: 'not-a-number' }
    expect(() => validateProject(p as unknown)).toThrow(ValidationError)
  })

  it('throws for missing node.moduleId', () => {
    const p = validProject()
    const node = p.pages[0].nodes.root as Record<string, unknown>
    delete node.moduleId
    expect(() => validateProject(p as unknown)).toThrow(ValidationError)
  })

  it('provides a descriptive path in the error', () => {
    const p = validProject()
    ;(p.pages[0].nodes['heading-1'] as Record<string, unknown>).id = 99
    try {
      validateProject(p as unknown)
      throw new Error('expected throw')
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError)
      expect((e as ValidationError).path).toContain('heading-1')
      expect((e as ValidationError).path).toContain('.id')
    }
  })
})

// ── Richtext prop sanitization (Task #302 / Constraint #299) ─────────────────
//
// validateProject() must sanitize all richtext-keyed props before returning.
// This closes the tampered-project-file XSS vector: a project saved before the
// DOMPurify write boundary was in place (or modified in IndexedDB) would carry
// unsanitized richtext that would reach the publisher's pass-through unguarded.

describe('validateProject — richtext prop sanitization on hydration', () => {
  it('strips <script> from a richtext-keyed prop', () => {
    const p = validProject()
    ;(p.pages[0].nodes['heading-1'].props as Record<string, unknown>).richtext =
      '<b>hello</b><script>alert(1)</script>'
    const result = validateProject(p)
    const sanitized = result.pages[0].nodes['heading-1'].props.richtext as string
    expect(sanitized).not.toContain('<script>')
    expect(sanitized).not.toContain('alert(1)')
    expect(sanitized).toContain('<b>hello</b>')
  })

  it('strips onerror attribute from richtext html prop', () => {
    const p = validProject()
    ;(p.pages[0].nodes['heading-1'].props as Record<string, unknown>).html =
      '<img src="x" onerror="alert(1)">'
    const result = validateProject(p)
    const sanitized = result.pages[0].nodes['heading-1'].props.html as string
    expect(sanitized).not.toContain('onerror')
    expect(sanitized).not.toContain('alert(1)')
  })

  it('strips javascript: href from richtext props', () => {
    const p = validProject()
    ;(p.pages[0].nodes['heading-1'].props as Record<string, unknown>).richtext =
      '<a href="javascript:alert(1)">click me</a>'
    const result = validateProject(p)
    const sanitized = result.pages[0].nodes['heading-1'].props.richtext as string
    expect(sanitized).not.toContain('javascript:')
  })

  it('sanitizes props with richtext suffix (bodyHtml, contentRichtext)', () => {
    const p = validProject()
    ;(p.pages[0].nodes['heading-1'].props as Record<string, unknown>).bodyHtml =
      '<p>safe</p><script>evil()</script>'
    ;(p.pages[0].nodes['heading-1'].props as Record<string, unknown>).contentRichtext =
      '<em>ok</em><iframe src="evil.com"></iframe>'
    const result = validateProject(p)
    expect(result.pages[0].nodes['heading-1'].props.bodyHtml as string).not.toContain('<script>')
    expect(result.pages[0].nodes['heading-1'].props.contentRichtext as string).not.toContain('<iframe>')
  })

  it('preserves safe formatting HTML in richtext props', () => {
    const p = validProject()
    const safe = '<p><strong>Bold</strong> and <em>italic</em> <a href="https://example.com">link</a></p>'
    ;(p.pages[0].nodes['heading-1'].props as Record<string, unknown>).richtext = safe
    const result = validateProject(p)
    const sanitized = result.pages[0].nodes['heading-1'].props.richtext as string
    expect(sanitized).toContain('<strong>Bold</strong>')
    expect(sanitized).toContain('<em>italic</em>')
  })

  it('leaves non-richtext props untouched', () => {
    const p = validProject()
    // 'text', 'label', 'fontSize' are not richtext keys — must not be altered
    ;(p.pages[0].nodes['heading-1'].props as Record<string, unknown>).text = 'Hello World'
    ;(p.pages[0].nodes['heading-1'].props as Record<string, unknown>).fontSize = 24
    const result = validateProject(p)
    expect(result.pages[0].nodes['heading-1'].props.text).toBe('Hello World')
    expect(result.pages[0].nodes['heading-1'].props.fontSize).toBe(24)
  })

  it('handles empty richtext prop without error', () => {
    const p = validProject()
    ;(p.pages[0].nodes['heading-1'].props as Record<string, unknown>).richtext = ''
    const result = validateProject(p)
    expect(result.pages[0].nodes['heading-1'].props.richtext).toBe('')
  })
})

// ── projectMode round-trip (Task #428 helper-audit) ──────────────────────────
//
// validateProject must preserve projectMode when present and default to 'html'
// for legacy projects. Previously the field was silently omitted from the return
// value, causing any project saved in 'react' mode to lose that setting on reload.

describe('validateProject — projectMode field', () => {
  it('defaults to "html" when projectMode is absent (legacy project)', () => {
    const p = validProject() // local validProject doesn't include projectMode
    const result = validateProject(p)
    expect(result.projectMode).toBe('html')
  })

  it('preserves projectMode: "html" when explicitly set', () => {
    const p = { ...validProject(), projectMode: 'html' }
    const result = validateProject(p)
    expect(result.projectMode).toBe('html')
  })

  it('preserves projectMode: "react" when explicitly set', () => {
    const p = { ...validProject(), projectMode: 'react' }
    const result = validateProject(p)
    expect(result.projectMode).toBe('react')
  })

  it('coerces unknown projectMode values to "html"', () => {
    const p = { ...validProject(), projectMode: 'astro' }
    const result = validateProject(p as unknown)
    expect(result.projectMode).toBe('html')
  })

  it('preserves safe project dependencies and filters unsafe package names', () => {
    const p = {
      ...validProject(),
      packageJson: {
        dependencies: {
          three: '^0.184.0',
          'three; rm -rf /': '^1.0.0',
        },
        devDependencies: {
          '@types/react': '^18.2.0',
        },
      },
    }
    const result = validateProject(p as unknown)
    expect(result.packageJson?.dependencies.three).toBe('^0.184.0')
    expect(result.packageJson?.dependencies['three; rm -rf /']).toBeUndefined()
    expect(result.packageJson?.devDependencies['@types/react']).toBe('^18.2.0')
  })
})

// ── classes round-trip (Task #428 helper-audit) ───────────────────────────────
//
// validateProject must return an empty classes map for legacy projects (no classes
// field) and preserve existing class definitions. Regression gate for the
// field-passthrough audit that also found gaps in test fixture helpers.

describe('validateProject — classes field', () => {
  it('returns empty classes map when classes field is absent (legacy project)', () => {
    const p = validProject() // local validProject doesn't include classes
    const result = validateProject(p)
    expect(result.classes).toEqual({})
  })

  it('returns empty classes map when classes is null', () => {
    const p = { ...validProject(), classes: null }
    const result = validateProject(p as unknown)
    expect(result.classes).toEqual({})
  })
})
