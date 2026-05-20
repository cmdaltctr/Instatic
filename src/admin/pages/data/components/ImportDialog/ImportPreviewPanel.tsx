/**
 * ImportPreviewPanel — renders the `BundlePreview` diff and strategy picker.
 *
 * Shows:
 *   1. Bundle metadata (filename, exported date, source site name)
 *   2. Per-table diff against the current local site
 *   3. Strategy radio group (replace / merge-add / merge-overwrite)
 *
 * Purely presentational — all state lives in `ImportDialog`.
 */
import type { BundlePreview, ImportStrategy } from '@core/data/bundleSchema'
import styles from './ImportDialog.module.css'

export interface ImportPreviewPanelProps {
  preview: BundlePreview
  filename: string
  strategy: ImportStrategy
  onStrategyChange: (strategy: ImportStrategy) => void
}

// ---------------------------------------------------------------------------
// Strategy options
// ---------------------------------------------------------------------------

interface StrategyOption {
  value: ImportStrategy
  title: string
  description: string
}

const STRATEGY_OPTIONS: ReadonlyArray<StrategyOption> = [
  {
    value: 'replace',
    title: 'Replace everything',
    description:
      'Wipe the local site and replace with the bundle. Default for full restores.',
  },
  {
    value: 'merge-add',
    title: 'Merge — add only',
    description:
      "Insert bundle rows that don't exist locally; skip when an id already exists. Safe.",
  },
  {
    value: 'merge-overwrite',
    title: 'Merge — overwrite',
    description:
      "Upsert every bundle row. Local rows that aren't in the bundle stay untouched.",
  },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type TableEntry = BundlePreview['tables'][number]

/** Unit label for a table entry — singular or plural based on currentLocal count. */
function unitLabel(kind: TableEntry['kind'], count: number): string {
  if (kind === 'page') return count === 1 ? 'page' : 'pages'
  if (kind === 'component') return count === 1 ? 'component' : 'components'
  return count === 1 ? 'row' : 'rows'
}

function formatDiffRow(entry: TableEntry): string {
  const unit = unitLabel(entry.kind, entry.currentLocal)

  if (entry.inBundle === 0) {
    return `0 in bundle (current: ${entry.currentLocal} ${unit})`
  }
  if (entry.willReplace > 0 && entry.willAdd > 0) {
    return `${entry.inBundle} in bundle, ${entry.willReplace} will replace, ${entry.willAdd} new (current: ${entry.currentLocal} ${unit})`
  }
  if (entry.willAdd > 0) {
    return `${entry.inBundle} in bundle, all new (current: ${entry.currentLocal} ${unit})`
  }
  if (entry.willReplace > 0) {
    return `${entry.inBundle} in bundle, all replace existing (current: ${entry.currentLocal} ${unit})`
  }
  // inBundle > 0 but willReplace = 0 and willAdd = 0 — shouldn't normally occur
  // but render defensively.
  return `${entry.inBundle} in bundle (current: ${entry.currentLocal} ${unit})`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ImportPreviewPanel({
  preview,
  filename,
  strategy,
  onStrategyChange,
}: ImportPreviewPanelProps) {
  const exportedAt = new Date(preview.meta.exportedAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  const hasContent =
    preview.tables.some((t) => t.inBundle > 0) || preview.totals.mediaFiles > 0

  return (
    <div className={styles.preview}>
      {/* ── Bundle metadata ─────────────────────────────────────────────── */}
      <div className={styles.previewMeta}>
        <p className={styles.metaRow}>
          <span className={styles.metaLabel}>Bundle</span>
          <span className={styles.metaValue}>{filename}</span>
        </p>
        <p className={styles.metaRow}>
          <span className={styles.metaLabel}>Exported</span>
          <span className={styles.metaValue}>{exportedAt}</span>
        </p>
        {preview.meta.sourceSiteName && (
          <p className={styles.metaRow}>
            <span className={styles.metaLabel}>From site</span>
            <span className={styles.metaValue}>"{preview.meta.sourceSiteName}"</span>
          </p>
        )}
      </div>

      {/* ── Diff list ───────────────────────────────────────────────────── */}
      <div className={styles.previewSection}>
        <p className={styles.sectionHeading}>Diff against current site</p>
        {!hasContent ? (
          <p className={styles.emptyBundle}>No content in this bundle.</p>
        ) : (
          <ul className={styles.diffList}>
            {preview.tables.map((entry) => (
              <li key={entry.id} className={styles.diffRow}>
                <span className={styles.diffBullet} aria-hidden="true">•</span>
                <span className={styles.diffTableName}>{entry.name}</span>
                <span className={styles.diffDetail}>{formatDiffRow(entry)}</span>
              </li>
            ))}
            {preview.totals.mediaFiles > 0 && (
              <li className={styles.diffRow}>
                <span className={styles.diffBullet} aria-hidden="true">•</span>
                <span className={styles.diffTableName}>Media files</span>
                <span className={styles.diffDetail}>
                  {preview.totals.mediaFiles}{' '}
                  {preview.totals.mediaEmbedded
                    ? '(bytes embedded)'
                    : '(not embedded — paths only)'}
                </span>
              </li>
            )}
          </ul>
        )}
      </div>

      {/* ── Strategy radio ──────────────────────────────────────────────── */}
      <fieldset className={styles.strategyFieldset}>
        <legend className={styles.sectionHeading}>Import strategy</legend>
        {STRATEGY_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={styles.strategyOption}
            data-selected={strategy === opt.value ? 'true' : undefined}
          >
            <input
              type="radio"
              name="import-strategy"
              value={opt.value}
              checked={strategy === opt.value}
              onChange={() => onStrategyChange(opt.value)}
              className={styles.strategyRadio}
            />
            <span className={styles.strategyContent}>
              <span className={styles.strategyTitle}>{opt.title}</span>
              <span
                className={styles.strategyDescription}
                data-tone={opt.value === 'replace' ? 'danger' : undefined}
              >
                {opt.description}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
    </div>
  )
}
