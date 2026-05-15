/**
 * SaveIndicator — shows "Saved" or "Unsaved changes" pill in the toolbar.
 *
 * Subscribes only to `hasUnsavedChanges` — re-renders on that flag only.
 * J12 persistence sets this flag via `setHasUnsavedChanges()` on
 * auto-save and on explicit Cmd+S.
 *
 * The pill uses role="status" so screen readers announce state changes
 * without interrupting the user's workflow (polite, not assertive).
 */

import { useEditorStore } from '@site/store/store'
import { useState } from 'react'
import { Button } from '@ui/components/Button'
import { cn } from '@ui/cn'
import { CircleAlertSolidIcon } from 'pixel-art-icons/icons/circle-alert-solid'
import { LoaderIcon } from 'pixel-art-icons/icons/loader'
import { SaveSolidIcon } from 'pixel-art-icons/icons/save-solid'
import { useEditorPreference } from '@site/preferences/editorPreferences'
import type { PersistenceSaveStatus } from '@site/hooks/usePersistence'
import styles from './Toolbar.module.css'

interface SaveIndicatorProps {
  onSave?: () => void | Promise<void>
  saveStatus?: PersistenceSaveStatus
}

export function SaveIndicator({ onSave, saveStatus }: SaveIndicatorProps) {
  const hasUnsaved = useEditorStore((s) => s.hasUnsavedChanges)
  const autoSaveEnabled = useEditorPreference('autoSave')
  const [isSaving, setIsSaving] = useState(false)
  const isStatusSaving = saveStatus?.state === 'saving'
  const saveError = saveStatus?.state === 'error' ? saveStatus.message ?? 'Save failed' : null

  async function handleManualSave() {
    if (!onSave || isSaving || isStatusSaving) return
    setIsSaving(true)
    try {
      await onSave()
    } catch (err) {
      console.error('[toolbar] Manual save failed:', err)
    } finally {
      setIsSaving(false)
    }
  }

  if (saveError) {
    return (
      <div className={styles.statusWrapper}>
        <Button
          variant="destructive"
          size="sm"
          aria-label="Retry save"
          tooltip={saveError}
          onClick={handleManualSave}
          disabled={!onSave || isSaving || isStatusSaving}
          data-testid="save-indicator"
        >
          <CircleAlertSolidIcon size={14} aria-hidden="true" />
          <span>Save failed</span>
        </Button>
        <div role="alert" className={styles.statusToast}>
          {saveError}
        </div>
      </div>
    )
  }

  if (isStatusSaving || (!autoSaveEnabled && hasUnsaved)) {
    const label = isSaving || isStatusSaving
      ? 'Saving...'
      : 'Save'

    return (
      <Button
        variant="primary"
        size="sm"
        aria-label={isStatusSaving ? 'Saving site' : 'Save site'}
        aria-busy={isSaving || isStatusSaving}
        tooltip="Save changes"
        onClick={handleManualSave}
        disabled={!onSave || isStatusSaving}
        data-testid="save-indicator"
      >
        {isSaving || isStatusSaving ? (
          <LoaderIcon size={14} aria-hidden="true" />
        ) : (
          <SaveSolidIcon size={14} aria-hidden="true" />
        )}
        <span>{label}</span>
      </Button>
    )
  }

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="save-indicator"
      aria-label={hasUnsaved ? 'Unsaved changes' : 'All changes saved'}
      className={cn(
        styles.pill,
        hasUnsaved ? styles.pillUnsaved : styles.pillSaved,
      )}
    >
      {/* Status dot */}
      <span
        aria-hidden="true"
        className={cn(
          styles.dot,
          hasUnsaved ? styles.dotUnsaved : styles.dotSaved,
        )}
      />
      {hasUnsaved ? 'Unsaved changes' : 'Saved'}
    </div>
  )
}
