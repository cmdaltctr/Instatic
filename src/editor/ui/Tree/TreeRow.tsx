import {
  forwardRef,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from 'react'
import type { IconComponent } from '@ui/icons/types'
import { ChevronRightIcon } from '@ui/icons/icons/chevron-right'
import { cn } from '@ui/cn'
import styles from './TreeRow.module.css'

const TREE_ROW_BASE_INDENT = 8
const TREE_ROW_INDENT_STEP = 12

export interface TreeRowProps extends HTMLAttributes<HTMLDivElement> {
  depth: number
  selected?: boolean
  hovered?: boolean
  focused?: boolean
  muted?: boolean
  locked?: boolean
  hidden?: boolean
  dragging?: boolean
  generated?: boolean
}

export const TreeRow = forwardRef<HTMLDivElement, TreeRowProps>(function TreeRow(
  {
    depth,
    selected = false,
    hovered = false,
    focused = false,
    muted = false,
    locked = false,
    hidden = false,
    dragging = false,
    generated = false,
    className,
    style,
    children,
    ...props
  },
  ref,
) {
  const paddingLeft = TREE_ROW_BASE_INDENT + depth * TREE_ROW_INDENT_STEP

  return (
    <div
      ref={ref}
      style={{
        '--tree-row-pl': `${paddingLeft}px`,
        ...style,
      } as CSSProperties}
      className={cn(
        styles.row,
        selected && styles.rowSelected,
        hovered && !selected && styles.rowHovered,
        focused && styles.rowFocused,
        muted && !selected && styles.rowMuted,
        locked && !selected && styles.rowLocked,
        hidden && styles.rowHidden,
        generated && styles.rowGenerated,
        dragging && styles.rowDragging,
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
})

export interface TreeChevronProps extends HTMLAttributes<HTMLSpanElement> {
  expanded?: boolean
  visible?: boolean
}

export function TreeChevron({
  expanded = false,
  visible = true,
  className,
  ...props
}: TreeChevronProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        styles.chevron,
        expanded ? styles.chevronExpanded : styles.chevronCollapsed,
        !visible && styles.chevronHidden,
        className,
      )}
      {...props}
    >
      <ChevronRightIcon size={10} />
    </span>
  )
}

export interface TreeIconSlotProps extends HTMLAttributes<HTMLSpanElement> {
  icon?: IconComponent
  iconSize?: number
  iconColor?: string
  children?: ReactNode
}

export function TreeIconSlot({
  icon: SlotIcon,
  iconSize = 12,
  iconColor = 'currentColor',
  className,
  children,
  ...props
}: TreeIconSlotProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(styles.iconSlot, className)}
      {...props}
    >
      {children ?? (SlotIcon ? <SlotIcon size={iconSize} color={iconColor} /> : null)}
    </span>
  )
}

export function TreeLabelGroup({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn(styles.labelGroup, className)} {...props} />
}

export function TreeLabel({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn(styles.label, className)} {...props} />
}

export function TreeMeta({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn(styles.meta, className)} {...props} />
}
