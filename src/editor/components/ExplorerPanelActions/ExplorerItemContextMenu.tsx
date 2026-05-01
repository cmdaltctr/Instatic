import { useEffect, useRef, type ReactNode } from 'react'
import {
  ContextMenu,
  ContextMenuItem,
} from '@ui/components/ContextMenu'
import { DeleteIcon } from '@ui/icons/icons/delete'
import { EditIcon } from '@ui/icons/icons/edit'

export interface ExplorerContextMenuItem {
  label: string
  action: () => void
  icon: ReactNode
  danger?: boolean
  disabled?: boolean
}

interface ExplorerItemContextMenuProps {
  x: number
  y: number
  ariaLabel: string
  onClose: () => void
  onRename: () => void
  onDelete: () => void
  deleteDisabled?: boolean
  extraItems?: ExplorerContextMenuItem[]
}

export function ExplorerItemContextMenu({
  x,
  y,
  ariaLabel,
  onClose,
  onRename,
  onDelete,
  deleteDisabled = false,
  extraItems = [],
}: ExplorerItemContextMenuProps) {
  const firstItemRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    firstItemRef.current?.focus()
  }, [])

  const items: ExplorerContextMenuItem[] = [
    ...extraItems,
    { label: 'Rename', action: onRename, icon: <EditIcon size={13} /> },
    { label: 'Delete', action: onDelete, icon: <DeleteIcon size={13} />, danger: true, disabled: deleteDisabled },
  ]

  return (
    <ContextMenu x={x} y={y} ariaLabel={ariaLabel} onClose={onClose}>
      {items.map((item, i) => (
        <ContextMenuItem
          key={item.label}
          ref={i === 0 ? firstItemRef : undefined}
          danger={item.danger ?? false}
          disabled={item.disabled}
          onClick={item.action}
        >
          <span aria-hidden="true">{item.icon}</span>
          {item.label}
        </ContextMenuItem>
      ))}
    </ContextMenu>
  )
}
