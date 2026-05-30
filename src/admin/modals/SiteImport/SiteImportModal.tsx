/**
 * SiteImportModal — the Super Import wizard.
 *
 * A five-step dialog that lets the user import a static site (folder, .zip,
 * or loose files) into the page builder in a single undo-able operation.
 *
 * Steps:
 *   drop      → user drops/picks files
 *   analyze   → review plan: pages, style rules, media, skipped items
 *   conflicts → resolve slug / class-name conflicts (skipped if none)
 *   run       → upload assets + commit to store
 *   done      → summary + action shortcuts
 *
 * Mount pattern: the parent renders `{siteImportModalOpen && <SiteImportModal />}`
 * so the component is always freshly mounted on open — no reset logic needed.
 *
 * Undo guarantee: `mutateAllPagesAndSite` wraps the full commit in one Immer
 * history snapshot, so Cmd+Z reverts the entire import in one press.
 */

import { useState, type ReactNode } from 'react'
import { nanoid } from 'nanoid'
import { Dialog } from '@ui/components/Dialog'
import { Button } from '@ui/components/Button'
import { pushToast } from '@ui/components/Toast'
import {
  ingestInput,
  buildImportPlan,
  commitImportPlan,
  applyConflictResolutions,
  type FileMap,
  type ImportPlan,
  type ImportResult,
  type ConflictResolution,
  type PageConflict,
  type RuleConflict,
  EmptyImportError,
  OversizeImportError,
  ZipBombError,
  TooManyFilesError,
  PathTraversalError,
} from '@core/siteImport'
import { useEditorStore } from '@site/store/store'
import { DropStep } from './steps/DropStep'
import { AnalyzeStep } from './steps/AnalyzeStep'
import { ConflictsStep } from './steps/ConflictsStep'
import { RunStep } from './steps/RunStep'
import { DoneStep } from './steps/DoneStep'
import { createSiteImportAdapter } from './shared/createSiteImportAdapter'
import type { RunProgress } from './shared/ImportProgress'
import styles from './SiteImportModal.module.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Step = 'drop' | 'analyze' | 'conflicts' | 'run' | 'done'

export interface ImportSelection {
  pagesIncluded: Set<string>       // by source path
  styleRulesIncluded: Set<number>  // by index in plan.styleRules
  assetsIncluded: Set<string>      // by sourcePath
}

// ---------------------------------------------------------------------------
// Default selection
// ---------------------------------------------------------------------------

function makeDefaultSelection(plan: ImportPlan): ImportSelection {
  return {
    pagesIncluded: new Set(plan.pages.map((p) => p.source)),
    styleRulesIncluded: new Set(plan.styleRules.map((_, i) => i)),
    assetsIncluded: new Set(plan.assets.map((a) => a.sourcePath)),
  }
}

// ---------------------------------------------------------------------------
// Ingest error → human-readable message
// ---------------------------------------------------------------------------

function formatByteLimit(bytes: number): string {
  const mb = Math.round(bytes / (1024 * 1024))
  if (mb >= 1024 && mb % 1024 === 0) return `${mb / 1024} GB`
  return `${mb} MB`
}

function describeIngestError(err: unknown): string {
  if (err instanceof EmptyImportError) return 'No importable files found. Drop at least one HTML or CSS file.'
  if (err instanceof OversizeImportError) return `Import is too large (${Math.round(err.sizeBytes / 1024 / 1024)} MB). Maximum is ${formatByteLimit(err.limitBytes)}.`
  if (err instanceof ZipBombError) return 'ZIP archive is too large when uncompressed. Maximum uncompressed size is 5 GB.'
  if (err instanceof TooManyFilesError) return `Too many files (${err.count}). Maximum is ${err.limit}.`
  if (err instanceof PathTraversalError) return `Unsafe path detected: "${err.path}".`
  return err instanceof Error ? err.message : 'Unknown import error'
}

// ---------------------------------------------------------------------------
// Plan filtering by selection
// ---------------------------------------------------------------------------

function filterPlanBySelection(plan: ImportPlan, selection: ImportSelection): ImportPlan {
  return {
    ...plan,
    pages: plan.pages.filter((p) => selection.pagesIncluded.has(p.source)),
    styleRules: plan.styleRules.filter((_, i) => selection.styleRulesIncluded.has(i)),
    assets: plan.assets.filter((a) => selection.assetsIncluded.has(a.sourcePath)),
  }
}

// ---------------------------------------------------------------------------
// Resolution merging
// ---------------------------------------------------------------------------

function buildResolvedPlan(
  plan: ImportPlan,
  pageResMap: Map<string, ConflictResolution>,
  ruleResMap: Map<string, ConflictResolution>,
): ImportPlan {
  const updatedPageConflicts: PageConflict[] = plan.conflicts.pages.map((c) => ({
    ...c,
    defaultResolution: pageResMap.get(c.source) ?? c.defaultResolution,
  }))
  const updatedRuleConflicts: RuleConflict[] = plan.conflicts.rules.map((c) => ({
    ...c,
    defaultResolution: ruleResMap.get(c.desiredName) ?? c.defaultResolution,
  }))
  return applyConflictResolutions(
    { ...plan, conflicts: { pages: updatedPageConflicts, rules: updatedRuleConflicts } },
    updatedPageConflicts,
    updatedRuleConflicts,
  )
}

// ---------------------------------------------------------------------------
// Modal component
// ---------------------------------------------------------------------------

export function SiteImportModal() {
  const closeModal = useEditorStore((s) => s.closeSiteImportModal)

  // ── Wizard state ──────────────────────────────────────────────────────────

  const [step, setStep] = useState<Step>('drop')
  const [fileMap, setFileMap] = useState<FileMap | null>(null)
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [selection, setSelection] = useState<ImportSelection | null>(null)
  const [pageResolutions, setPageResolutions] = useState<Map<string, ConflictResolution>>(new Map())
  const [ruleResolutions, setRuleResolutions] = useState<Map<string, ConflictResolution>>(new Map())
  const [pageSlugOverrides, setPageSlugOverrides] = useState<Map<string, string>>(new Map())
  const [runProgress, setRunProgress] = useState<RunProgress>({
    phase: 'idle', completed: 0, total: 0, log: [],
  })
  const [result, setResult] = useState<ImportResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // ── Helpers ───────────────────────────────────────────────────────────────

  function appendRunLog(line: string) {
    setRunProgress((prev) => ({ ...prev, log: [...prev.log, line] }))
  }

  // ── Ingest + plan-build (triggered from DropStep callbacks) ───────────────

  async function handleFilesReady(files: File[]) {
    setBusy(true)
    setErrorMsg(null)
    try {
      const map = await ingestInput(files)
      finalizePlan(map)
    } catch (err) {
      console.error('[SiteImportModal] ingest failed:', err)
      setErrorMsg(describeIngestError(err))
      setBusy(false)
    }
  }

  async function handleZipReady(zipBytes: Uint8Array) {
    setBusy(true)
    setErrorMsg(null)
    try {
      const map = await ingestInput({ zipBytes })
      finalizePlan(map)
    } catch (err) {
      console.error('[SiteImportModal] ingest failed:', err)
      setErrorMsg(describeIngestError(err))
      setBusy(false)
    }
  }

  function finalizePlan(map: FileMap) {
    const currentSite = useEditorStore.getState().site
    if (!currentSite) {
      setErrorMsg('Editor has no site loaded. Open a site first.')
      setBusy(false)
      return
    }
    const importPlan = buildImportPlan({
      fileMap: map,
      currentSite,
      options: { mediaTolerance: 10 },
    })
    setFileMap(map)
    setPlan(importPlan)
    setSelection(makeDefaultSelection(importPlan))
    setPageResolutions(
      new Map(importPlan.conflicts.pages.map((c) => [c.source, c.defaultResolution])),
    )
    setRuleResolutions(
      new Map(importPlan.conflicts.rules.map((c) => [c.desiredName, c.defaultResolution])),
    )
    setPageSlugOverrides(new Map())
    setBusy(false)
    setStep('analyze')
  }

  // ── Step navigation ───────────────────────────────────────────────────────

  function handleAnalyzeNext() {
    if (!plan || !selection) return

    // Apply user slug overrides to the plan's pages
    const planWithSlugs: ImportPlan = {
      ...plan,
      pages: plan.pages.map((p) => ({
        ...p,
        slug: pageSlugOverrides.get(p.source) ?? p.slug,
      })),
    }

    const filtered = filterPlanBySelection(planWithSlugs, selection)
    const hasConflicts =
      filtered.conflicts.pages.length > 0 ||
      filtered.conflicts.rules.length > 0

    if (hasConflicts) {
      setPlan(filtered)
      setStep('conflicts')
    } else {
      setPlan(filtered)
      void kickOffRun(filtered, pageResolutions, ruleResolutions)
    }
  }

  function handleConflictsImport() {
    if (!plan) return
    void kickOffRun(plan, pageResolutions, ruleResolutions)
  }

  function handleBack() {
    if (step === 'conflicts') setStep('analyze')
    else if (step === 'analyze') setStep('drop')
  }

  // ── Run ───────────────────────────────────────────────────────────────────

  async function kickOffRun(
    planToRun: ImportPlan,
    pageResMap: Map<string, ConflictResolution>,
    ruleResMap: Map<string, ConflictResolution>,
  ) {
    const resolvedPlan = buildResolvedPlan(planToRun, pageResMap, ruleResMap)
    const total = resolvedPlan.assets.length

    setRunProgress({ phase: 'uploading', completed: 0, total, log: [] })
    setStep('run')

    let uploadedCount = 0

    const adapter = createSiteImportAdapter({
      sessionId: nanoid(),
      onUploadStart: ({ path }) => {
        appendRunLog(`Uploading ${path}…`)
        setRunProgress((prev) => ({ ...prev, phase: 'uploading' }))
      },
      onUploadComplete: ({ path }) => {
        uploadedCount++
        setRunProgress((prev) => ({
          ...prev,
          completed: uploadedCount,
        }))
        appendRunLog(`✓ ${path}`)
      },
      onCommitStart: () => {
        setRunProgress((prev) => ({ ...prev, phase: 'applying' }))
        appendRunLog('Applying changes to site…')
      },
      onCommitComplete: () => {
        setRunProgress((prev) => ({ ...prev, phase: 'done' }))
      },
    })

    try {
      const importResult = await commitImportPlan(resolvedPlan, adapter)
      appendRunLog(
        `Done — ${importResult.pages.length} pages, ${importResult.styleRules.length} style rules, ${importResult.assets.length} assets.`,
      )
      setRunProgress((prev) => ({ ...prev, phase: 'done' }))
      setResult(importResult)
      setStep('done')
      pushToast({
        kind: 'success',
        title: 'Site imported',
        body: `${importResult.pages.length} pages · ${importResult.styleRules.length} style rules · ${importResult.assets.length} assets`,
        location: 'site-workspace',
      })
    } catch (err) {
      console.error('[SiteImportModal] commit failed:', err)
      const msg = err instanceof Error ? err.message : 'Unknown import error'
      appendRunLog(`Error: ${msg}`)
      setRunProgress((prev) => ({ ...prev, phase: 'failed' }))
      pushToast({ kind: 'error', title: 'Import failed', body: msg })
    }
  }

  // ── Close ─────────────────────────────────────────────────────────────────

  function handleClose() {
    if (runProgress.phase === 'applying') return // uncancellable during commit
    closeModal()
  }

  function handleRunCancel() {
    // During upload phase we can close (orphaned assets are harmless per spec).
    closeModal()
  }

  // ── Footer ────────────────────────────────────────────────────────────────

  function renderFooter(): ReactNode {
    if (step === 'drop') return null

    if (step === 'analyze') {
      const selCount = selection
        ? selection.pagesIncluded.size + selection.styleRulesIncluded.size + selection.assetsIncluded.size
        : 0
      return (
        <>
          <Button variant="secondary" type="button" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="button"
            disabled={selCount === 0}
            onClick={handleAnalyzeNext}
          >
            Next →
          </Button>
        </>
      )
    }

    if (step === 'conflicts') {
      return (
        <>
          <Button variant="secondary" type="button" onClick={handleBack}>
            ← Back
          </Button>
          <Button variant="primary" type="button" onClick={handleConflictsImport}>
            Import
          </Button>
        </>
      )
    }

    if (step === 'run') return null // RunStep manages its own Cancel

    if (step === 'done') {
      return (
        <Button variant="secondary" type="button" onClick={handleClose}>
          Close
        </Button>
      )
    }

    return null
  }

  // ── Step titles ───────────────────────────────────────────────────────────

  const titleByStep: Record<Step, string> = {
    drop: 'Import site',
    analyze: 'Review import',
    conflicts: 'Resolve conflicts',
    run: 'Importing…',
    done: 'Import complete',
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Dialog
      open={true}
      onClose={handleClose}
      title={titleByStep[step]}
      eyebrow="Page builder"
      size="xl"
      tone="neutral"
      footer={renderFooter() ?? undefined}
      closeOnEscape={runProgress.phase !== 'applying'}
      closeOnBackdrop={runProgress.phase !== 'applying'}
    >
      <div className={styles.body}>
        {step === 'drop' && (
          <DropStep
            busy={busy}
            errorMessage={errorMsg}
            onFilesReady={(files) => { void handleFilesReady(files) }}
            onZipReady={(bytes) => { void handleZipReady(bytes) }}
          />
        )}

        {step === 'analyze' && plan && fileMap && selection && (
          <AnalyzeStep
            plan={plan}
            fileMap={fileMap}
            selection={selection}
            pageSlugOverrides={pageSlugOverrides}
            onSelectionChange={setSelection}
            onSlugOverride={(source, slug) => {
              setPageSlugOverrides((prev) => {
                const next = new Map(prev)
                next.set(source, slug)
                return next
              })
            }}
          />
        )}

        {step === 'conflicts' && plan && (
          <ConflictsStep
            plan={plan}
            pageResolutions={pageResolutions}
            ruleResolutions={ruleResolutions}
            onPageResolutionChange={(source, resolution) => {
              setPageResolutions((prev) => {
                const next = new Map(prev)
                next.set(source, resolution)
                return next
              })
            }}
            onRuleResolutionChange={(desiredName, resolution) => {
              setRuleResolutions((prev) => {
                const next = new Map(prev)
                next.set(desiredName, resolution)
                return next
              })
            }}
          />
        )}

        {step === 'run' && (
          <RunStep
            progress={runProgress}
            onCancel={handleRunCancel}
          />
        )}

        {step === 'done' && result && plan && (
          <DoneStep
            result={result}
            droppedJs={plan.droppedJs.length}
            droppedAtRules={plan.droppedAtRules.length}
            onClose={handleClose}
          />
        )}
      </div>
    </Dialog>
  )
}
