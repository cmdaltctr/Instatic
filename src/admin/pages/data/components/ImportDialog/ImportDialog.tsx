/**
 * ImportDialog — full import flow in a single dialog.
 *
 * Step 1: Drop zone — user picks a .json file. Client validates it against
 *         `SiteBundleSchema` immediately via `parseSiteBundle`.
 * Step 2: Preview — server diffs the bundle against the current site via
 *         `previewSiteBundle`. User picks a strategy.
 * Step 3: Import — `importSiteBundle` applies the bundle. On success, a toast
 *         surfaces the result counts. `onImportComplete` and `onClose` are
 *         called to let the parent refresh.
 *
 * All internal state resets whenever `open` flips from false → true, so
 * reopening the dialog always starts fresh at step 1.
 */
import { useState } from 'react'
import { Dialog } from '@ui/components/Dialog'
import { Button } from '@ui/components/Button'
import { pushToast } from '@ui/components/Toast'
import { importSiteBundle } from '@core/persistence/cmsTransfer'
import type { SiteBundle, ImportStrategy, ImportResult } from '@core/data/bundleSchema'
import { ImportFileDropZone } from './ImportFileDropZone'
import { ImportPreviewPanel } from './ImportPreviewPanel'
import { useImportPreview } from './useImportPreview'
import styles from './ImportDialog.module.css'

// ---------------------------------------------------------------------------
// Public props
// ---------------------------------------------------------------------------

export interface ImportDialogProps {
  open: boolean
  onClose: () => void
  /** Called after a successful import so the parent can refresh. */
  onImportComplete: () => void
}

// ---------------------------------------------------------------------------
// Private constants
// ---------------------------------------------------------------------------

const IMPORT_BUTTON_LABELS: Record<ImportStrategy, string> = {
  replace: 'Replace site',
  'merge-add': 'Add rows',
  'merge-overwrite': 'Overwrite rows',
}

const STRATEGY_LABELS: Record<ImportStrategy, string> = {
  replace: 'Replace',
  'merge-add': 'Merge-add',
  'merge-overwrite': 'Merge-overwrite',
}

// ---------------------------------------------------------------------------
// Toast body builder
// ---------------------------------------------------------------------------

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`
}

function buildToastBody(result: ImportResult): string {
  const parts: string[] = [STRATEGY_LABELS[result.strategy]]

  if (result.rowsInserted > 0) {
    parts.push(pluralize(result.rowsInserted, 'row added', 'rows added'))
  }
  if (result.rowsReplaced > 0) {
    parts.push(pluralize(result.rowsReplaced, 'replaced', 'replaced'))
  }
  if (result.rowsSkipped > 0) {
    parts.push(pluralize(result.rowsSkipped, 'row skipped (already present)', 'rows skipped (already present)'))
  }
  if (result.mediaImported > 0) {
    parts.push(pluralize(result.mediaImported, 'media file imported', 'media files imported'))
  }

  return parts.join(' · ')
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ImportDialog({ open, onClose, onImportComplete }: ImportDialogProps) {
  // `trackedOpen` mirrors `open` one render behind so we can detect the
  // closed → open transition at render time (render-time state reset pattern,
  // not useEffect, to satisfy react-hooks/set-state-in-effect).
  const [trackedOpen, setTrackedOpen] = useState(false)
  const [bundleState, setBundleState] = useState<{
    bundle: SiteBundle
    filename: string
  } | null>(null)
  const [strategy, setStrategy] = useState<ImportStrategy>('merge-add')
  const [importing, setImporting] = useState(false)

  // Render-time reset: when the dialog transitions from closed → open, reset
  // all internal state so each session starts at step 1. React batches these
  // setState calls into a single re-render.
  if (open && !trackedOpen) {
    setTrackedOpen(true)
    setBundleState(null)
    setStrategy('merge-add')
    setImporting(false)
  } else if (!open && trackedOpen) {
    setTrackedOpen(false)
  }

  const { preview, loading: previewLoading, error: previewError } = useImportPreview(
    bundleState?.bundle ?? null,
  )

  function handleBundleLoaded(bundle: SiteBundle, filename: string) {
    setBundleState({ bundle, filename })
  }

  function handleReset() {
    setBundleState(null)
    setStrategy('merge-add')
  }

  // The Import button is only enabled when we have a bundle, a successful
  // preview, and at least one row/media file to import.
  const hasContent =
    preview !== null &&
    (preview.tables.some((t) => t.inBundle > 0) || preview.totals.mediaFiles > 0)

  const canImport =
    bundleState !== null &&
    preview !== null &&
    hasContent &&
    !importing &&
    !previewLoading

  // ---------------------------------------------------------------------------
  // Import handler
  // ---------------------------------------------------------------------------

  async function handleImport() {
    if (!bundleState || !canImport) return
    setImporting(true)
    try {
      const result = await importSiteBundle(bundleState.bundle, strategy)
      pushToast({
        kind: 'success',
        title: 'Import complete',
        body: buildToastBody(result),
        location: 'data-workspace',
      })
      onImportComplete()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown import error'
      console.error('[ImportDialog] Import failed:', err)
      pushToast({
        kind: 'error',
        title: 'Import failed',
        body: msg,
        location: 'data-workspace',
      })
    } finally {
      setImporting(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Body rendering — three possible states
  // ---------------------------------------------------------------------------

  function renderBody() {
    // Step 1: no bundle yet
    if (!bundleState) {
      return (
        <ImportFileDropZone onBundleLoaded={handleBundleLoaded} disabled={importing} />
      )
    }

    // Step 2a: preview loading
    if (previewLoading) {
      return (
        <div className={styles.statusBlock}>
          <p className={styles.statusText} aria-live="polite">
            Checking bundle against current site…
          </p>
        </div>
      )
    }

    // Step 2b: preview error
    if (previewError) {
      return (
        <div className={styles.statusBlock}>
          <p role="alert" className={styles.errorText}>
            {previewError}
          </p>
          <Button variant="ghost" size="sm" type="button" onClick={handleReset}>
            Try a different file
          </Button>
        </div>
      )
    }

    // Step 2c: preview loaded — show diff + strategy picker
    if (preview) {
      return (
        <ImportPreviewPanel
          preview={preview}
          filename={bundleState.filename}
          strategy={strategy}
          onStrategyChange={setStrategy}
        />
      )
    }

    return null
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const importButtonLabel = importing
    ? 'Importing…'
    : IMPORT_BUTTON_LABELS[strategy]

  const importButtonVariant =
    strategy === 'replace' ? 'destructive' : 'primary'

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Import site"
      size="lg"
      tone={strategy === 'replace' ? 'danger' : 'neutral'}
      footer={
        <>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={onClose}
            disabled={importing}
          >
            Cancel
          </Button>
          <Button
            variant={importButtonVariant}
            size="sm"
            type="button"
            disabled={!canImport}
            onClick={handleImport}
          >
            {importButtonLabel}
          </Button>
        </>
      }
    >
      {renderBody()}
    </Dialog>
  )
}
