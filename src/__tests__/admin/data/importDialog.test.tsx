/**
 * ImportDialog — three-step import flow (drop-zone → preview → import).
 *
 * Tests:
 *   1. Initial state: drop zone shown, no preview, Import button disabled
 *   2. Invalid file: drop zone shows a role="alert" error
 *   3. Valid file: preview loaded, metadata + strategy picker shown
 *   4. Switching strategy: dialog tone switches to alertdialog for replace
 *   5. Import success: fetch called with right strategy, callbacks fired
 *   6. Import error: dialog stays open, error toast surfaced
 *   7. Empty bundle: preview shows "No content" message, Import button disabled
 *   8. Cancel calls onClose
 */

import { afterEach, describe, expect, it } from 'bun:test'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { DataTable, DataRow } from '@core/data/schemas'
import type { SiteBundle } from '@core/data/bundleSchema'
import { subscribeToasts, type Toast } from '@ui/components/Toast/toastBus'
import { ImportDialog } from '@admin/pages/data/components/ImportDialog/ImportDialog'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const POSTS_TABLE: DataTable = {
  id: 'posts',
  name: 'Posts',
  slug: 'posts',
  kind: 'postType',
  singularLabel: 'Post',
  pluralLabel: 'Posts',
  routeBase: '/posts',
  primaryFieldId: 'title',
  fields: [],
  system: true,
  createdByUserId: null,
  updatedByUserId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const POST_ROW: DataRow = {
  id: 'r1',
  tableId: 'posts',
  cells: {},
  slug: 'hello',
  status: 'published',
  authorUserId: null,
  createdByUserId: null,
  updatedByUserId: null,
  publishedByUserId: null,
  author: null,
  createdBy: null,
  updatedBy: null,
  publishedBy: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  publishedAt: null,
  deletedAt: null,
}

/** A minimal valid SiteBundle that passes parseSiteBundle validation. */
const BUNDLE: SiteBundle = {
  schemaVersion: 1,
  exportedAt: '2026-05-19T10:00:00.000Z',
  sourceSiteName: 'Fixture Site',
  tables: [POSTS_TABLE],
  rows: [POST_ROW],
}

/** BundlePreview response returned by POST /admin/api/cms/import/preview. */
const PREVIEW_DATA = {
  meta: {
    exportedAt: '2026-05-19T10:00:00.000Z',
    sourceSiteName: 'Fixture Site',
    schemaVersion: 1,
  },
  tables: [
    {
      id: 'posts',
      name: 'Posts',
      kind: 'postType',
      inBundle: 1,
      willReplace: 0,
      willAdd: 1,
      currentLocal: 0,
    },
  ],
  totals: {
    rows: 1,
    mediaFiles: 0,
    mediaEmbedded: false,
  },
}

/** Empty bundle preview: no rows in any table, no media. */
const EMPTY_PREVIEW_DATA = {
  meta: {
    exportedAt: '2026-05-19T10:00:00.000Z',
    sourceSiteName: 'Empty Site',
    schemaVersion: 1,
  },
  tables: [
    {
      id: 'posts',
      name: 'Posts',
      kind: 'postType',
      inBundle: 0,
      willReplace: 0,
      willAdd: 0,
      currentLocal: 5,
    },
  ],
  totals: {
    rows: 0,
    mediaFiles: 0,
    mediaEmbedded: false,
  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/**
 * Simulate a file being dropped onto the ImportFileDropZone.
 *
 * We use fireEvent.drop rather than fireEvent.change on the hidden file input
 * because happy-dom rejects Object.defineProperty on native HTMLInputElement
 * nodes ("Properties can only be defined on Objects"). The drop path goes
 * through the DragEvent's dataTransfer, which testing-library defines on the
 * plain JS event object — no native property override needed.
 */
function simulateFileDrop(file: File): void {
  const dropZone = screen.getByRole('button', { name: /drop a site bundle/i })
  fireEvent.drop(dropZone, { dataTransfer: { files: [file] } })
}

function makeBundleFile(bundle: SiteBundle, name = 'bundle.json'): File {
  return new File([JSON.stringify(bundle)], name, { type: 'application/json' })
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  cleanup()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ImportDialog', () => {
  it('initial state — drop zone shown, Import button disabled, no preview', () => {
    render(
      <ImportDialog open={true} onClose={() => {}} onImportComplete={() => {}} />,
    )

    // Drop zone visible
    expect(screen.getByRole('button', { name: /drop a site bundle/i })).toBeTruthy()

    // Import button is present but disabled (no bundle loaded yet)
    const importBtn = screen.getByRole('button', { name: /add rows/i }) as HTMLButtonElement
    expect(importBtn.disabled).toBe(true)

    // No preview content yet
    expect(screen.queryByText(/diff against current site/i)).toBeNull()
  })

  it('invalid file — drop zone shows a role="alert" error', async () => {
    render(
      <ImportDialog open={true} onClose={() => {}} onImportComplete={() => {}} />,
    )

    const badFile = new File(['not json'], 'bad.json', { type: 'application/json' })
    simulateFileDrop(badFile)

    // parseSiteBundle throws SiteBundleParseError → drop zone renders role="alert"
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy()
    })

    // Dialog stays open (neutral tone → role="dialog")
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('valid file — preview loaded, metadata and strategy picker shown', async () => {
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === '/admin/api/cms/import/preview') {
        return jsonResponse(PREVIEW_DATA)
      }
      return jsonResponse({ error: `Unexpected: ${url}` }, 500)
    }

    render(
      <ImportDialog open={true} onClose={() => {}} onImportComplete={() => {}} />,
    )

    simulateFileDrop(makeBundleFile(BUNDLE))

    // Wait for the preview panel to render
    await waitFor(() => {
      expect(screen.getByText(/diff against current site/i)).toBeTruthy()
    })

    // Bundle metadata is shown (source site name)
    expect(screen.getByText(/fixture site/i)).toBeTruthy()

    // Strategy picker is shown with default merge-add selected
    expect(screen.getByText(/import strategy/i)).toBeTruthy()
    const mergeAddRadio = screen.getByRole('radio', { name: /merge.*add only/i }) as HTMLInputElement
    expect(mergeAddRadio.checked).toBe(true)
  })

  it('switching strategy — replace switches dialog to alertdialog, others restore to dialog', async () => {
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === '/admin/api/cms/import/preview') {
        return jsonResponse(PREVIEW_DATA)
      }
      return jsonResponse({ error: `Unexpected: ${url}` }, 500)
    }

    render(
      <ImportDialog open={true} onClose={() => {}} onImportComplete={() => {}} />,
    )

    simulateFileDrop(makeBundleFile(BUNDLE))

    // Wait for the preview panel
    await waitFor(() => {
      expect(screen.getByText(/diff against current site/i)).toBeTruthy()
    })

    // Default tone is neutral → role="dialog"
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.queryByRole('alertdialog')).toBeNull()

    // Select the "Replace everything" strategy
    const replaceRadio = screen.getByRole('radio', { name: /replace everything/i })
    fireEvent.click(replaceRadio)

    // Tone switches to danger → role="alertdialog"
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()

    // Switch to merge-overwrite → back to role="dialog"
    const mergeOverwriteRadio = screen.getByRole('radio', { name: /merge.*overwrite/i })
    fireEvent.click(mergeOverwriteRadio)

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('import success — fetch called with strategy, onImportComplete and onClose fired', async () => {
    let onImportCompleteCalled = false
    let onCloseCalled = false
    let importUrl: string | null = null
    let importBody: unknown = null

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === '/admin/api/cms/import/preview') {
        return jsonResponse(PREVIEW_DATA)
      }
      if (url.startsWith('/admin/api/cms/import')) {
        importUrl = url
        importBody = JSON.parse((init?.body as string) ?? '{}')
        return jsonResponse({
          ok: true,
          strategy: 'merge-add',
          tablesAffected: 1,
          rowsInserted: 3,
          rowsReplaced: 0,
          rowsSkipped: 1,
          mediaImported: 0,
        })
      }
      return jsonResponse({ error: `Unexpected: ${url}` }, 500)
    }

    let capturedToasts: Toast[] = []
    const unsub = subscribeToasts((snapshot) => { capturedToasts = [...snapshot] })

    try {
      render(
        <ImportDialog
          open={true}
          onClose={() => { onCloseCalled = true }}
          onImportComplete={() => { onImportCompleteCalled = true }}
        />,
      )

      simulateFileDrop(makeBundleFile(BUNDLE))

      // Wait for preview panel
      await waitFor(() => {
        expect(screen.getByText(/diff against current site/i)).toBeTruthy()
      })

      // Click the Import button (default strategy = merge-add → "Add rows")
      fireEvent.click(screen.getByRole('button', { name: /add rows/i }))

      await waitFor(() => {
        expect(onCloseCalled).toBe(true)
      })

      expect(onImportCompleteCalled).toBe(true)

      // Import fetch was called with the expected strategy query param
      expect(importUrl).not.toBeNull()
      expect(importUrl!).toContain('strategy=merge-add')

      // Import body is the bundle (schemaVersion is a reliable discriminator)
      expect((importBody as { schemaVersion: number }).schemaVersion).toBe(1)

      // Success toast was pushed
      expect(capturedToasts.some((t) => t.kind === 'success' && t.title === 'Import complete')).toBe(true)
    } finally {
      unsub()
    }
  })

  it('import error — dialog stays open, error toast surfaced, callbacks not called', async () => {
    let onImportCompleteCalled = false
    let onCloseCalled = false

    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === '/admin/api/cms/import/preview') {
        return jsonResponse(PREVIEW_DATA)
      }
      if (url.startsWith('/admin/api/cms/import')) {
        return new Response(JSON.stringify({ error: 'import failed on server' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        })
      }
      return jsonResponse({ error: `Unexpected: ${url}` }, 500)
    }

    let capturedToasts: Toast[] = []
    const unsub = subscribeToasts((snapshot) => { capturedToasts = [...snapshot] })

    try {
      render(
        <ImportDialog
          open={true}
          onClose={() => { onCloseCalled = true }}
          onImportComplete={() => { onImportCompleteCalled = true }}
        />,
      )

      simulateFileDrop(makeBundleFile(BUNDLE))

      await waitFor(() => {
        expect(screen.getByText(/diff against current site/i)).toBeTruthy()
      })

      fireEvent.click(screen.getByRole('button', { name: /add rows/i }))

      // Error toast is surfaced via pushToast
      await waitFor(() => {
        expect(capturedToasts.some((t) => t.kind === 'error' && t.title === 'Import failed')).toBe(true)
      })

      // Dialog stays open — neither callback was called
      expect(onCloseCalled).toBe(false)
      expect(onImportCompleteCalled).toBe(false)

      // Preview panel is still visible
      expect(screen.getByText(/diff against current site/i)).toBeTruthy()
    } finally {
      unsub()
    }
  })

  it('empty bundle — preview shows "No content" message, Import button disabled', async () => {
    const emptyBundle: SiteBundle = {
      schemaVersion: 1,
      exportedAt: '2026-05-19T10:00:00.000Z',
      sourceSiteName: 'Empty Site',
      tables: [POSTS_TABLE],
      rows: [],
    }

    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === '/admin/api/cms/import/preview') {
        return jsonResponse(EMPTY_PREVIEW_DATA)
      }
      return jsonResponse({ error: `Unexpected: ${url}` }, 500)
    }

    render(
      <ImportDialog open={true} onClose={() => {}} onImportComplete={() => {}} />,
    )

    simulateFileDrop(makeBundleFile(emptyBundle, 'empty.json'))

    await waitFor(() => {
      expect(screen.getByText(/no content in this bundle/i)).toBeTruthy()
    })

    // Import button is disabled because hasContent = false
    const importBtn = screen.getByRole('button', { name: /add rows/i }) as HTMLButtonElement
    expect(importBtn.disabled).toBe(true)
  })

  it('Cancel button calls onClose', () => {
    let onCloseCalled = false
    render(
      <ImportDialog
        open={true}
        onClose={() => { onCloseCalled = true }}
        onImportComplete={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCloseCalled).toBe(true)
  })
})
