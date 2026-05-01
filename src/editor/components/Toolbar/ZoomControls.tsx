/**
 * ZoomControls — toolbar controls for canvas zoom level.
 *
 * Shows current zoom %, zoom in (+), zoom out (-), and fit-to-screen.
 *
 * Performance: subscribes only to `zoom` — re-renders ONLY when zoom changes.
 * The zoom level display needs the current value; the buttons only need actions.
 *
 * Keyboard shortcuts (handled in useCanvas, documented here for screen readers):
 *   +/= → zoom in
 *   -   → zoom out
 *   Shift+1 → fit to screen / reset view
 */

import { useEditorStore } from '@core/editor-store/store'
import { MinusIcon } from '@ui/icons/icons/minus'
import { PlusIcon } from '@ui/icons/icons/plus'
import { Button } from '@ui/components/Button'
import styles from './Toolbar.module.css'

export function ZoomControls() {
  // Subscribe only to zoom — no re-render when other canvas state changes
  const zoom = useEditorStore((s) => s.zoom)
  const zoomIn = useEditorStore((s) => s.zoomIn)
  const zoomOut = useEditorStore((s) => s.zoomOut)
  const resetView = useEditorStore((s) => s.resetView)

  const pct = Math.round(zoom * 100)

  return (
    <div
      role="group"
      aria-label="Zoom controls"
      data-testid="toolbar-zoom-controls"
      className={styles.zoomGroup}
    >
      {/* Zoom out */}
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        aria-label="Zoom out"
        aria-keyshortcuts="-"
        title="Zoom out (−)"
        onClick={zoomOut}
      >
        <MinusIcon size={14} />
      </Button>

      {/* Zoom % display — click to reset to 100% */}
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Current zoom ${pct}%. Click to reset to 100%.`}
        title="Reset to 100% (Shift+1 for fit-to-screen)"
        onClick={resetView}
        numeric
        className={styles.zoomPct}
      >
        {pct}%
      </Button>

      {/* Zoom in */}
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        aria-label="Zoom in"
        aria-keyshortcuts="="
        title="Zoom in (+)"
        onClick={zoomIn}
      >
        <PlusIcon size={14} />
      </Button>
    </div>
  )
}
