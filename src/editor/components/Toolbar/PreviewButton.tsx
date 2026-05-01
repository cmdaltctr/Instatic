/**
 * PreviewButton — opens the in-browser preview overlay (Phase 7).
 *
 * WCAG 2.5.5: 44×44px minimum touch target.
 */
import { useEditorStore } from '@core/editor-store/store'
import { EyeIcon } from '@ui/icons/icons/eye'
import { Button } from '@ui/components/Button'

export function PreviewButton() {
  const openPreview = useEditorStore((s) => s.openPreview)
  const site = useEditorStore((s) => s.site)
  const disabled = !site

  return (
    <Button
      variant="secondary"
      size="sm"
      aria-label="Preview page"
      title="Preview published output"
      onClick={() => openPreview()}
      disabled={disabled}
      data-testid="toolbar-preview-btn"
    >
      <EyeIcon size={14} aria-hidden="true" />
      <span>Preview</span>
    </Button>
  )
}
