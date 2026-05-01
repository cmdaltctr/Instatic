import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import {
  ContextMenu as UIContextMenu,
  ContextMenuItem,
} from '@ui/components/ContextMenu'
import { EditIcon } from '@ui/icons/icons/edit'
import { CopyIcon } from '@ui/icons/icons/copy'
import { LayoutIcon } from '@ui/icons/icons/layout'
import { DeleteIcon } from '@ui/icons/icons/delete'

interface LayerNodeContextMenuProps {
  x: number
  y: number
  onClose: () => void
  onDelete: () => void
  onDuplicate: () => void
  onRename: () => void
  onWrapInContainer: () => void
}

export function LayerNodeContextMenu({
  x,
  y,
  onClose,
  onDelete,
  onDuplicate,
  onRename,
  onWrapInContainer,
}: LayerNodeContextMenuProps) {
  const firstItemRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    firstItemRef.current?.focus()
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
    }
  }

  const items: { label: string; action: () => void; icon: ReactNode; danger: boolean }[] = [
    { label: 'Rename', action: onRename, icon: <EditIcon size={13} />, danger: false },
    { label: 'Duplicate', action: onDuplicate, icon: <CopyIcon size={13} />, danger: false },
    { label: 'Wrap in Container', action: onWrapInContainer, icon: <LayoutIcon size={13} />, danger: false },
    { label: 'Delete', action: onDelete, icon: <DeleteIcon size={13} />, danger: true },
  ]

  return (
    <UIContextMenu
      x={x}
      y={y}
      ariaLabel="Node options"
      onClose={onClose}
      onKeyDown={handleKeyDown}
    >
      {items.map((item, i) => (
        <ContextMenuItem
          key={item.label}
          ref={i === 0 ? firstItemRef : undefined}
          danger={item.danger}
          onClick={item.action}
        >
          <span aria-hidden="true">{item.icon}</span>
          {item.label}
        </ContextMenuItem>
      ))}
    </UIContextMenu>
  )
}
