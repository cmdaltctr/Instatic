/**
 * ConflictRow — a single slug or class-name conflict with its resolution picker.
 *
 * Shows the source path (or class name) and a `<Select>` for the resolution
 * action. When "Custom…" is selected, an `<Input>` appears inline for the
 * user to type the custom slug or name.
 */
import { Select } from '@ui/components/Select'
import { Input } from '@ui/components/Input'
import type { ConflictResolution } from '@core/siteImport'
import styles from './ConflictRow.module.css'

const ACTION_OPTIONS = [
  { value: 'auto-rename', label: 'Auto-rename' },
  { value: 'overwrite',   label: 'Overwrite' },
  { value: 'skip',        label: 'Skip' },
  { value: 'custom-rename', label: 'Custom…' },
]

// Options minus "Overwrite" — used when there is no existing target to
// overwrite (an intra-batch collision between two imported items).
const ACTION_OPTIONS_NO_OVERWRITE = ACTION_OPTIONS.filter((o) => o.value !== 'overwrite')

export interface ConflictRowProps {
  kind: 'page' | 'rule'
  source: string
  desired: string
  current: ConflictResolution
  /**
   * Whether an "Overwrite" target actually exists. False for intra-batch
   * collisions (two imported items resolving to the same slug/name with no
   * pre-existing page/rule) — overwriting nothing is meaningless and would
   * abort the commit, so the option is hidden.
   */
  canOverwrite?: boolean
  onChange: (next: ConflictResolution) => void
}

export function ConflictRow({ kind, source, desired, current, canOverwrite = true, onChange }: ConflictRowProps) {
  const isCustom = current.action === 'custom-rename'
  const customValue =
    kind === 'page'
      ? (current.resolvedSlug ?? desired)
      : (current.resolvedName ?? desired)

  function handleActionChange(action: string) {
    const typed = action as ConflictResolution['action']
    if (typed === 'auto-rename') {
      onChange({ action: typed })
    } else if (typed === 'overwrite') {
      onChange({ action: typed })
    } else if (typed === 'skip') {
      onChange({ action: typed })
    } else {
      // custom-rename — pre-fill with the desired value
      onChange(
        kind === 'page'
          ? { action: typed, resolvedSlug: desired }
          : { action: typed, resolvedName: desired },
      )
    }
  }

  return (
    <div className={styles.row}>
      <div className={styles.meta}>
        <span className={styles.source}>{source || desired}</span>
        <span className={styles.desired}>{desired}</span>
      </div>
      <div className={styles.controls}>
        <Select
          value={current.action}
          fieldSize="sm"
          options={canOverwrite ? ACTION_OPTIONS : ACTION_OPTIONS_NO_OVERWRITE}
          onChange={(e) => handleActionChange(e.target.value)}
          aria-label="Conflict resolution"
        />
        {isCustom && (
          <Input
            fieldSize="sm"
            value={customValue}
            onChange={(e) => {
              onChange(
                kind === 'page'
                  ? { action: 'custom-rename', resolvedSlug: e.target.value }
                  : { action: 'custom-rename', resolvedName: e.target.value },
              )
            }}
            placeholder={kind === 'page' ? 'custom-slug' : 'custom-class'}
            aria-label={kind === 'page' ? 'Custom slug' : 'Custom class name'}
          />
        )}
      </div>
    </div>
  )
}
