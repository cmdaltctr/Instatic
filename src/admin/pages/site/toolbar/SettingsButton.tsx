/**
 * SettingsButton — opens the Settings modal.
 */
import { useEditorStore } from '@site/store/store'
import { SettingsCogSolidIcon } from 'pixel-art-icons/icons/settings-cog-solid'
import { Button } from '@ui/components/Button'

export function SettingsButton() {
  const openSettings = useEditorStore((s) => s.openSettingsModal)

  return (
    <Button
      variant="ghost"
      size="sm"
      iconOnly
      aria-label="Open settings"
      tooltip="Settings"
      onClick={() => openSettings('pages')}
      data-testid="toolbar-settings-btn"
    >
      <SettingsCogSolidIcon size={16} aria-hidden="true" />
    </Button>
  )
}
