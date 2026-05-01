/**
 * Toolbar — fixed top bar for the editor.
 *
 * Layout (left → right):
 *   [Project name] [UndoRedo] [divider]
 *   [ZoomControls] [spacer→] [SaveIndicator/Save] [Preview] [Publish] [Settings]
 *
 * Accessibility (WCAG 2.1 AA):
 * - role="banner" for the top-level landmark
 * - aria-label on the nav region
 * - All interactive children have 44×44px minimum touch targets
 * - Keyboard shortcuts for Undo/Redo are registered by UndoRedoButtons
 */

import { useEditorStore } from '@core/editor-store/store'
import { UndoRedoButtons } from './UndoRedoButtons'
import { ZoomControls } from './ZoomControls'
import { PublishButton } from './PublishButton'
import { PreviewButton } from './PreviewButton'
import { SettingsButton } from './SettingsButton'
import { SaveIndicator } from './SaveIndicator'
import { PreviewOverlay } from '../Preview/PreviewOverlay'
import type { PersistenceSaveStatus } from '@editor/hooks/usePersistence'
import styles from './Toolbar.module.css'

interface ToolbarProps {
  onSave?: () => void | Promise<void>
  saveStatus?: PersistenceSaveStatus
  publishEnabled?: boolean
}

export function Toolbar({ onSave, saveStatus, publishEnabled = true }: ToolbarProps) {
  const projectName = useEditorStore((s) => s.project?.name ?? 'Untitled Project')

  return (
    <>
      {/* Preview overlay rendered outside the toolbar so it can cover the whole screen */}
      <PreviewOverlay />
      <header
        role="banner"
        aria-label="Editor toolbar"
        data-testid="toolbar"
        className={styles.header}
      >
        {/* ── Left section ────────────────────────────────────────────────── */}

        {/* Project name */}
        <span
          className={styles.projectName}
          title={projectName}
          aria-label={`Project: ${projectName}`}
        >
          {projectName}
        </span>

        <Divider />
        <UndoRedoButtons />

        {/* ── Spacer ──────────────────────────────────────────────────────── */}
        <div className={styles.spacer} aria-hidden="true" />

        {/* ── Right section ───────────────────────────────────────────────── */}
        <ZoomControls />
        <Divider />
        <SaveIndicator onSave={onSave} saveStatus={saveStatus} />
        <Divider />
        <PreviewButton />
        <PublishButton enabled={publishEnabled} onSave={onSave} />
        <SettingsButton />
      </header>
    </>
  )
}

function Divider() {
  return (
    <div
      aria-hidden="true"
      className={styles.divider}
    />
  )
}
