/**
 * siteImportCommands.test.ts
 *
 * Unit tests for the `getSiteImportCommands()` Spotlight command factory.
 *
 * Covers:
 *   1. Command shape — id, title, subtitle, group, workspaces, capability
 *   2. Keywords — 'import', 'site', 'zip', 'folder', 'html', 'css' present
 *   3. run() — calls ctx.closeSpotlight() and opens the modal via the store
 *
 * See also the parallel `getImportHtmlCommands` implementation in
 * `src/admin/spotlight/commands/importHtml.ts` — both follow the same pattern.
 */

import { describe, it, expect } from 'bun:test'
import { getSiteImportCommands } from '@admin/spotlight/commands/siteImport'
import { useEditorStore } from '@site/store/store'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal spotlight context — mirrors the SpotlightContext shape. */
function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    closeSpotlight: () => {},
    // Placeholders for other ctx members the command doesn't use
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// 1 — Command shape
// ---------------------------------------------------------------------------

describe('getSiteImportCommands — command shape', () => {
  const commands = getSiteImportCommands()

  it('returns exactly one command', () => {
    expect(commands).toHaveLength(1)
  })

  it('command id is "editor.importSite"', () => {
    expect(commands[0].id).toBe('editor.importSite')
  })

  it('command title is "Import Site"', () => {
    expect(commands[0].title).toBe('Import Site')
  })

  it('subtitle describes the operation', () => {
    const { subtitle } = commands[0]
    expect(typeof subtitle).toBe('string')
    expect((subtitle as string).length).toBeGreaterThan(0)
    // Should mention at least one of: folder, zip, files, pages, archive
    const lc = (subtitle as string).toLowerCase()
    const mentionsRelevantTerm =
      lc.includes('folder') ||
      lc.includes('zip') ||
      lc.includes('file') ||
      lc.includes('page') ||
      lc.includes('archive')
    expect(mentionsRelevantTerm).toBe(true)
  })

  it('group is "editor"', () => {
    expect(commands[0].group).toBe('editor')
  })

  it('workspaces is ["site"]', () => {
    expect(commands[0].workspaces).toEqual(['site'])
  })

  it('capability includes site-write capabilities', () => {
    const cap = commands[0].capability
    expect(Array.isArray(cap)).toBe(true)
    const caps = cap as string[]
    expect(caps).toContain('site.structure.edit')
    expect(caps).toContain('site.content.edit')
    expect(caps).toContain('site.style.edit')
  })

  it('has an iconName', () => {
    expect(typeof commands[0].iconName).toBe('string')
    expect((commands[0].iconName as string).length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// 2 — Keywords
// ---------------------------------------------------------------------------

describe('getSiteImportCommands — keywords', () => {
  const { keywords } = getSiteImportCommands()[0]

  it('keywords includes "import"', () => {
    expect(keywords).toContain('import')
  })

  it('keywords includes "site"', () => {
    expect(keywords).toContain('site')
  })

  it('keywords includes "zip"', () => {
    expect(keywords).toContain('zip')
  })

  it('keywords includes "folder"', () => {
    expect(keywords).toContain('folder')
  })

  it('keywords includes "html"', () => {
    expect(keywords).toContain('html')
  })

  it('keywords includes "css"', () => {
    expect(keywords).toContain('css')
  })
})

// ---------------------------------------------------------------------------
// 3 — run() — calls closeSpotlight and opens the import modal
// ---------------------------------------------------------------------------

describe('getSiteImportCommands — run()', () => {
  it('calls ctx.closeSpotlight() when run', async () => {
    let spotlightClosed = false
    const ctx = makeCtx({ closeSpotlight: () => { spotlightClosed = true } })
    await commands()[0].run(ctx as never)
    expect(spotlightClosed).toBe(true)
  })

  it('opens the Site Import modal via the store', async () => {
    // Reset to closed
    useEditorStore.setState({
      siteImportModalOpen: false,
    } as Parameters<typeof useEditorStore.setState>[0])

    const ctx = makeCtx()
    await commands()[0].run(ctx as never)

    expect(useEditorStore.getState().siteImportModalOpen).toBe(true)

    // Cleanup
    useEditorStore.getState().closeSiteImportModal()
  })

  it('closeSpotlight() is called before the modal opens', async () => {
    const callOrder: string[] = []
    const ctx = makeCtx({
      closeSpotlight: () => callOrder.push('closeSpotlight'),
    })
    // Spy on openSiteImportModal via store subscription
    const origOpen = useEditorStore.getState().openSiteImportModal
    useEditorStore.setState({
      openSiteImportModal: () => {
        callOrder.push('openModal')
        origOpen()
      },
    } as Parameters<typeof useEditorStore.setState>[0])

    await commands()[0].run(ctx as never)

    expect(callOrder[0]).toBe('closeSpotlight')

    // Restore
    useEditorStore.setState({ openSiteImportModal: origOpen } as Parameters<typeof useEditorStore.setState>[0])
    useEditorStore.getState().closeSiteImportModal()
  })
})

function commands() {
  return getSiteImportCommands()
}
