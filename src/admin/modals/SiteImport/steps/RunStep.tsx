/**
 * RunStep — shows live import progress and a Cancel button.
 *
 * The actual import logic runs in SiteImportModal. This component is purely
 * presentational: it receives the current RunProgress and a cancel handler.
 */
import { Button } from '@ui/components/Button'
import { ImportProgress, type RunProgress } from '../shared/ImportProgress'
import styles from './RunStep.module.css'

interface RunStepProps {
  progress: RunProgress
  onCancel: () => void
}

export function RunStep({ progress, onCancel }: RunStepProps) {
  const canCancel = progress.phase === 'uploading' || progress.phase === 'idle'

  return (
    <div className={styles.wrapper}>
      <ImportProgress progress={progress} />
      <div className={styles.actions}>
        <Button
          variant="secondary"
          size="sm"
          type="button"
          disabled={!canCancel}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
