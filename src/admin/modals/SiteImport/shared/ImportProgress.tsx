/**
 * ImportProgress — shows the live progress of an in-flight site import.
 *
 * Renders a ProgressBar, a phase label, and an append-only log list that
 * auto-scrolls to the bottom as new entries arrive.
 */
import { useEffect, useRef } from 'react'
import { ProgressBar } from '@ui/components/ProgressBar'
import styles from './ImportProgress.module.css'

export type RunPhase = 'idle' | 'uploading' | 'applying' | 'done' | 'failed'

export interface RunProgress {
  phase: RunPhase
  completed: number
  total: number
  log: string[]
}

interface ImportProgressProps {
  progress: RunProgress
}

export function ImportProgress({ progress }: ImportProgressProps) {
  const logRef = useRef<HTMLUListElement | null>(null)
  const { phase, completed, total, log } = progress

  // Auto-scroll the log to the bottom when new lines arrive.
  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [log.length])

  const tone =
    phase === 'done' ? 'success' :
    phase === 'failed' ? 'danger' :
    'default'

  const isIndeterminate =
    phase === 'idle' ||
    (phase === 'uploading' && total === 0) ||
    phase === 'applying'

  const phaseLabel =
    phase === 'idle' ? 'Preparing…' :
    phase === 'uploading'
      ? total > 0 ? `Uploading assets (${completed} / ${total})` : 'Uploading assets…' :
    phase === 'applying' ? 'Applying changes…' :
    phase === 'done' ? 'Done' :
    'Import failed'

  return (
    <div className={styles.wrapper}>
      <p className={styles.phaseLabel}>{phaseLabel}</p>
      <ProgressBar
        value={completed}
        max={total > 0 ? total : 100}
        tone={tone}
        size="md"
        indeterminate={isIndeterminate}
        label="Import progress"
        className={styles.bar}
      />
      {log.length > 0 && (
        <ul
          ref={logRef}
          className={styles.log}
          aria-live="polite"
          aria-label="Import log"
        >
          {log.map((line, i) => (
            // Index key is correct here — log is append-only, existing lines never change.
            <li key={i} className={styles.logLine}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
