/**
 * UndoRedoButtons — Undo and Redo toolbar buttons.
 *
 * Accessibility (Guideline #224):
 * - Buttons are ALWAYS rendered in the DOM — never conditionally removed.
 * - When unavailable: aria-disabled="true" + visual grey. NOT the `disabled` HTML attr.
 * - aria-keyshortcuts documents the keyboard shortcut for screen readers.
 */
import { useEffect } from 'react'
import { useCanUndo, useCanRedo, useUndo, useRedo } from '@core/editor-store/store'
import { UndoIcon } from '@ui/icons/icons/undo'
import { RedoIcon } from '@ui/icons/icons/redo'
import { Button } from '@ui/components/Button'
import styles from './Toolbar.module.css'

export function UndoRedoButtons() {
  const canUndo = useCanUndo()
  const canRedo = useCanRedo()
  const undo = useUndo()
  const redo = useRedo()

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey
      if (!isMod) return

      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) return

      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault()
        redo()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [undo, redo])

  return (
    <div
      role="group"
      aria-label="Undo and redo"
      className={styles.undoRedoGroup}
    >
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        aria-label="Undo"
        aria-keyshortcuts="Meta+Z"
        aria-disabled={!canUndo}
        onClick={canUndo ? undo : undefined}
        title="Undo (⌘Z)"
        data-testid="toolbar-undo-btn"
      >
        <UndoIcon size={16} aria-hidden="true" />
      </Button>

      <Button
        variant="ghost"
        size="sm"
        iconOnly
        aria-label="Redo"
        aria-keyshortcuts="Meta+Shift+Z"
        aria-disabled={!canRedo}
        onClick={canRedo ? redo : undefined}
        title="Redo (⌘⇧Z)"
        data-testid="toolbar-redo-btn"
      >
        <RedoIcon size={16} aria-hidden="true" />
      </Button>
    </div>
  )
}
