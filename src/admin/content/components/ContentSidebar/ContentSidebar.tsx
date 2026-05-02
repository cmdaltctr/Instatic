import { useRef, type CSSProperties, type ReactNode } from 'react'
import { Button } from '@ui/components/Button'
import { BookOpenIcon } from '@ui/icons/icons/book-open'
import { ImagesIcon } from '@ui/icons/icons/images'
import type { IconComponent } from '@ui/icons/types'
import { useEditorStore } from '@core/editor-store/store'
import leftSidebarStyles from '@editor/components/LeftSidebar/LeftSidebar.module.css'
import panelRailStyles from '@editor/components/PanelRail/PanelRail.module.css'
import { SidebarResizeHandle } from '@editor/components/shared/SidebarResizeHandle'

export type ContentPanelId = 'content' | 'media'

interface ContentSidebarProps {
  activePanel: ContentPanelId | null
  onActivePanelChange: (panel: ContentPanelId | null) => void
  contentPanel: ReactNode
  mediaPanel: ReactNode
}

export function ContentSidebar({
  activePanel,
  onActivePanelChange,
  contentPanel,
  mediaPanel,
}: ContentSidebarProps) {
  const sidebarRef = useRef<HTMLElement | null>(null)
  const leftSidebarWidth = useEditorStore((s) => s.leftSidebarWidth)
  const setLeftSidebarWidth = useEditorStore((s) => s.setLeftSidebarWidth)
  const panelWidth = activePanel ? leftSidebarWidth : 0
  const style = {
    '--left-sidebar-panel-width': `${panelWidth}px`,
  } as CSSProperties

  return (
    <aside
      ref={sidebarRef}
      className={leftSidebarStyles.sidebar}
      data-testid="left-sidebar"
      data-expanded={activePanel ? 'true' : 'false'}
      data-active-panel={activePanel ?? 'none'}
      style={style}
    >
      <nav
        aria-label="Content panel dock"
        className={panelRailStyles.rail}
        data-testid="content-panel-rail"
      >
        <div className={panelRailStyles.itemGroup}>
          <ContentRailButton
            id="content"
            label="Content"
            icon={BookOpenIcon}
            iconName="book-open"
            accent="mint"
            active={activePanel === 'content'}
            onToggle={() => onActivePanelChange(activePanel === 'content' ? null : 'content')}
          />
          <ContentRailButton
            id="media"
            label="Media"
            icon={ImagesIcon}
            iconName="images"
            accent="sky"
            active={activePanel === 'media'}
            onToggle={() => onActivePanelChange(activePanel === 'media' ? null : 'media')}
          />
        </div>
      </nav>

      <div
        className={leftSidebarStyles.panelSlot}
        data-testid="left-sidebar-panel-slot"
        aria-hidden={activePanel ? undefined : 'true'}
      >
        <div className={leftSidebarStyles.panelMount}>
          {activePanel === 'content' ? contentPanel : activePanel === 'media' ? mediaPanel : null}
        </div>
      </div>

      {activePanel && (
        <SidebarResizeHandle
          side="left"
          width={leftSidebarWidth}
          targetRef={sidebarRef}
          cssVariable="--left-sidebar-panel-width"
          ariaLabel="Resize content sidebar"
          onResize={setLeftSidebarWidth}
        />
      )}
    </aside>
  )
}

interface ContentRailButtonProps {
  id: ContentPanelId
  label: string
  icon: IconComponent
  iconName: string
  accent: 'mint' | 'sky'
  active: boolean
  onToggle: () => void
}

function ContentRailButton({
  id,
  label,
  icon,
  iconName,
  accent,
  active,
  onToggle,
}: ContentRailButtonProps) {
  const RailIcon = icon
  const action = active ? 'Close' : 'Open'

  return (
    <Button
      variant="ghost"
      size="md"
      iconOnly
      pressed={active}
      aria-label={`${action} ${label} panel`}
      title={`${label} panel`}
      data-testid={`panel-rail-${id}`}
      data-icon={iconName}
      data-accent={accent}
      onClick={onToggle}
      className={panelRailStyles.railButton}
    >
      <span className={panelRailStyles.activeIndicator} aria-hidden="true" />
      <RailIcon size={16} className={panelRailStyles.railIcon} />
    </Button>
  )
}
