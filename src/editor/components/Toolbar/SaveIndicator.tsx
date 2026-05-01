/**
 * SaveIndicator — shows "Saved" or "Unsaved changes" pill in the toolbar.
 *
 * Subscribes only to `hasUnsavedChanges` — re-renders on that flag only.
 * J12 (LocalAdapter) sets this flag via `setHasUnsavedChanges()` on
 * auto-save and on explicit Cmd+S.
 *
 * The pill uses role="status" so screen readers announce state changes
 * without interrupting the user's workflow (polite, not assertive).
 */

import { useEditorStore } from '@core/editor-store/store'
import { useEffect, useState } from 'react'
import { Button } from '@ui/components/Button'
import { cn } from '@ui/cn'
import { Icon } from '../../../ui/icons/Icon'
import {
  readAutoSavePreference,
  subscribeToEditorPrefsChanged,
} from '../../preferences/editorPreferences'
import type { PersistenceSaveStatus } from '@editor/hooks/usePersistence'
import styles from './Toolbar.module.css'

interface SaveIndicatorProps {
  onSave?: () => void | Promise<void>
  saveStatus?: PersistenceSaveStatus
}

export function SaveIndicator({ onSave, saveStatus }: SaveIndicatorProps) {
  const hasUnsaved = useEditorStore((s) => s.hasUnsavedChanges)
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(readAutoSavePreference)
  const [isSaving, setIsSaving] = useState(false)
  const isStatusSaving = saveStatus?.state === 'saving'
  const saveError = saveStatus?.state === 'error' ? saveStatus.message ?? 'Save failed' : null

  useEffect(() => {
    return subscribeToEditorPrefsChanged(() => {
      setAutoSaveEnabled(readAutoSavePreference())
    })
  }, [])

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
          title={saveError}
          onClick={handleManualSave}
          disabled={!onSave || isSaving || isStatusSaving}
          data-testid="save-indicator"
        >
          <Icon name="circle-alert" size={14} aria-hidden="true" />
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
        aria-label={isStatusSaving ? 'Saving project' : 'Save project'}
        aria-busy={isSaving || isStatusSaving}
        title="Save changes"
        onClick={handleManualSave}
        disabled={!onSave || isStatusSaving}
        data-testid="save-indicator"
      >
        <Icon name={isSaving || isStatusSaving ? 'loader' : 'save'} size={14} aria-hidden="true" />
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
