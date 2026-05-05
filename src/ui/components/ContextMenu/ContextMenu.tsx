import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { Button, type ButtonProps } from '@ui/components/Button'
import { Separator } from '@ui/components/Separator'
import { ChevronRightIcon } from 'pixel-art-icons/icons/chevron-right'
import { cn } from '@ui/cn'
import {
  computeFloatingPosition,
  type FloatingAlign,
  type FloatingSide,
  type ResolvedFloatingSide,
} from '@ui/lib/floatingPosition'
import styles from './ContextMenu.module.css'

/**
 * Dropdown auto-priority: prefer opening below the trigger, then above,
 * then to the right, then to the left.
 *
 * This is intentionally different from the Tooltip auto-priority (which
 * starts at `top`) because dropdown menus that open *upward* by default
 * feel inverted; users expect them to drop *down*.
 */
const DROPDOWN_AUTO_PRIORITY = ['bottom', 'top', 'right', 'left'] as const

interface ContextMenuPositionState {
  x: number
  y: number
  side: ResolvedFloatingSide
}

interface ContextMenuProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  ariaLabel: string
  onClose: () => void
  children: ReactNode
  minWidth?: number
  width?: number
  zIndex?: number
  menuClassName?: string
  /**
   * When provided, the menu switches to a non-modal dismiss mode:
   *   - The invisible backdrop overlay is NOT rendered.
   *   - Outside-click detection runs at the document level (mousedown
   *     capture phase).
   *   - Clicks inside this trigger element do NOT close the menu — the
   *     trigger keeps receiving native focus and clicks while open.
   *
   * Use this for combobox/dropdown patterns where the trigger is an
   * editable input that must stay focused (e.g. ClassPicker). Right-click
   * context menus that should fully capture the next click can leave this
   * prop undefined and the modal backdrop is used instead.
   */
  triggerRef?: RefObject<HTMLElement | null>
  /**
   * Absolute viewport-pixel x coordinate of the menu's left edge.
   * Use this together with `y` for point-anchored menus (e.g. right-click).
   * Mutually exclusive with `anchorRef`.
   */
  x?: number
  /** Absolute viewport-pixel y coordinate of the menu's top edge. */
  y?: number
  /**
   * Element whose bounding rect anchors the menu. The menu measures its
   * own size after mount and picks the side with the most available
   * viewport space (auto-flip), behaving the same way as <Tooltip>.
   * Mutually exclusive with `x`/`y`.
   *
   * Position recomputes on window resize and capture-phase scroll while
   * the menu is open, so the menu stays glued to the trigger.
   */
  anchorRef?: RefObject<HTMLElement | null>
  /**
   * Preferred side relative to the anchor. `'auto'` tries the priority
   * list `bottom → top → right → left` and picks the first that fits.
   * Default: `'auto'`. Ignored when `anchorRef` is not provided.
   */
  side?: FloatingSide
  /**
   * Cross-axis alignment relative to the anchor. Default: `'start'`
   * (menu's left edge aligns with the anchor's left edge). Ignored when
   * `anchorRef` is not provided.
   */
  align?: FloatingAlign
  /**
   * Gap between anchor edge and menu, in px. Default: 6. Ignored when
   * `anchorRef` is not provided.
   */
  offset?: number
}

export const ContextMenu = forwardRef<HTMLDivElement, ContextMenuProps>(function ContextMenu(
  {
    ariaLabel,
    onClose,
    children,
    minWidth = 176,
    width = minWidth,
    zIndex = 1000,
    menuClassName,
    triggerRef,
    x: pointX,
    y: pointY,
    anchorRef,
    side = 'auto',
    align = 'start',
    offset = 6,
    onKeyDown,
    ...domProps
  },
  ref,
) {

  const menuRef = useRef<HTMLDivElement | null>(null)
  const setMenuRef = (node: HTMLDivElement | null) => {
    menuRef.current = node
    if (typeof ref === 'function') ref(node)
    else if (ref) ref.current = node
  }

  // ── Anchor-based auto-flip positioning ────────────────────────────────
  //
  // When `anchorRef` is provided, the menu is positioned by measuring
  // itself and the anchor in a layout effect, then choosing the best side
  // via the shared floating-position helper. This mirrors the auto-flip
  // behaviour of <Tooltip> so dropdown menus never overflow off-screen.
  const [autoPosition, setAutoPosition] = useState<ContextMenuPositionState | null>(null)

  const recomputeAutoPosition = useEvent(() => {
    if (!anchorRef) return
    const anchorEl = anchorRef.current
    const menuEl = menuRef.current
    if (!anchorEl || !menuEl) return
    const anchorRect = anchorEl.getBoundingClientRect()
    const menuRect = menuEl.getBoundingClientRect()
    // Use the explicit `width` prop (which the CSS renders to) rather than
    // the measured rect width — this keeps positioning predictable in jsdom
    // tests and avoids double-counting any layout-time width clamping.
    const next = computeFloatingPosition(anchorRect, {
      floatingWidth: width,
      floatingHeight: menuRect.height,
      side,
      align,
      offset,
      autoPriority: DROPDOWN_AUTO_PRIORITY,
    })
    setAutoPosition({ x: next.x, y: next.y, side: next.side })
  })

  useLayoutEffect(() => {
    if (!anchorRef) return
    recomputeAutoPosition()
  }, [anchorRef, recomputeAutoPosition])

  useEffect(() => {
    if (!anchorRef) return
    function onViewportChange() {
      recomputeAutoPosition()
    }
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onViewportChange, true)
    return () => {
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('scroll', onViewportChange, true)
    }
  }, [anchorRef, recomputeAutoPosition])

  // Resolve the effective x/y the menu renders at:
  //   - anchor mode: use the auto-flipped position (or hide until measured)
  //   - point mode:  use the explicit x/y from the caller
  const resolvedX = anchorRef ? autoPosition?.x : pointX
  const resolvedY = anchorRef ? autoPosition?.y : pointY
  const resolvedSide: ResolvedFloatingSide | undefined = anchorRef
    ? autoPosition?.side
    : undefined

  // While we measure the menu in anchor mode, render it off-screen with
  // visibility:hidden so it doesn't flash at (0, 0) before the layout
  // effect runs.
  const measuring = anchorRef && autoPosition === null

  const style = {
    '--context-menu-x': `${resolvedX ?? 0}px`,
    '--context-menu-y': `${resolvedY ?? 0}px`,
    '--context-menu-min-width': `${minWidth}px`,
    '--context-menu-width': `${width}px`,
    '--context-menu-z-index': zIndex,
    ...(measuring ? { visibility: 'hidden' as const } : null),
  } as CSSProperties

  // Non-modal dismiss: any click outside the menu, the explicit triggerRef
  // (if set), and the anchor element (if set) closes the menu. The anchor
  // is included so anchored dropdowns don't re-close themselves when the
  // user clicks the trigger that just opened them.
  useEffect(() => {
    if (!triggerRef && !anchorRef) return
    function handlePointerDown(event: MouseEvent) {
      const target = event.target
      if (!(target instanceof Node)) return
      if (menuRef.current?.contains(target)) return
      if (triggerRef?.current?.contains(target)) return
      if (anchorRef?.current?.contains(target)) return
      onClose()
    }
    document.addEventListener('mousedown', handlePointerDown, true)
    document.addEventListener('contextmenu', handlePointerDown, true)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown, true)
      document.removeEventListener('contextmenu', handlePointerDown, true)
    }
  }, [onClose, triggerRef, anchorRef])

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
    onKeyDown?.(event)
  }

  const menu = (
    <div
      ref={setMenuRef}
      role="menu"
      aria-label={ariaLabel}
      className={cn(styles.menu, menuClassName)}
      data-side={resolvedSide}
      style={style}
      onKeyDown={handleKeyDown}
      {...domProps}
    >
      {children}
    </div>
  )

  // Non-modal mode (combobox-style or anchor-positioned dropdown): no
  // backdrop, document listener handles dismiss when triggerRef is set.
  if (triggerRef || anchorRef) return menu

  // Modal mode (right-click context menu): invisible backdrop intercepts clicks.
  return (
    <>
      <div
        className={styles.backdrop}
        onClick={onClose}
        onContextMenu={(event) => {
          event.preventDefault()
          onClose()
        }}
        style={style}
      />
      {menu}
    </>
  )
})

/**
 * Stable callback wrapper — the latest function is read on each invocation,
 * so effects can depend on the wrapper without re-subscribing every render.
 *
 * Equivalent to React's experimental `useEvent`; inlined here to avoid
 * pulling a third-party dep just for this one use.
 */
function useEvent<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => TReturn,
): (...args: TArgs) => TReturn {
  const ref = useRef(fn)
  useLayoutEffect(() => {
    ref.current = fn
  })
  const stable = useRef((...args: TArgs) => ref.current(...args))
  return stable.current
}

interface ContextMenuItemProps extends Omit<ButtonProps, 'variant' | 'size' | 'menuItem' | 'tone'> {
  danger?: boolean
}

export const ContextMenuItem = forwardRef<HTMLButtonElement, ContextMenuItemProps>(
  function ContextMenuItem({ danger = false, className, children, ...props }, ref) {
    return (
      <Button
        ref={ref}
        variant="ghost"
        size="xs"
        menuItem
        role="menuitem"
        tone={danger ? 'danger' : 'default'}
        className={cn(styles.item, className)}
        {...props}
      >
        {children}
      </Button>
    )
  },
)

export function ContextMenuSeparator() {
  return <Separator spacing="compact" className={styles.separator} />
}

// ---------------------------------------------------------------------------
// ContextMenuSubmenu
// ---------------------------------------------------------------------------

interface ContextMenuSubmenuProps {
  /** Trigger label — displayed on the submenu row */
  label: ReactNode
  /** Optional icon shown to the left of the label (use pixel-art-icons) */
  icon?: ReactNode
  /**
   * Called after a submenu item is clicked — typically the parent menu's
   * `onClose` handler so the entire menu closes when an item is selected.
   */
  onClose?: () => void
  /** Submenu items — typically `ContextMenuItem` elements */
  children: ReactNode
  /** z-index base for the submenu panel (submenu uses zIndex + 10). Default: 1000 */
  zIndex?: number
}

/**
 * Nested submenu trigger for ContextMenu.
 *
 * Renders a trigger row (role="menuitem") with a trailing chevron. Hovering
 * or pressing ArrowRight opens a positioned submenu panel to the right.
 * ArrowLeft or Escape closes the submenu without closing the parent menu.
 * Clicking a submenu item calls `onClose` (if provided) to close the parent.
 *
 * Usage:
 * ```tsx
 * <ContextMenuSubmenu label="Insert here" icon={<PlusIcon size={12} />} onClose={close}>
 *   <ContextMenuItem onClick={...}>Item A</ContextMenuItem>
 * </ContextMenuSubmenu>
 * ```
 */
export function ContextMenuSubmenu({
  label,
  icon,
  onClose,
  children,
  zIndex = 1000,
}: ContextMenuSubmenuProps) {
  const [open, setOpen] = useState(false)
  const [submenuStyle, setSubmenuStyle] = useState<CSSProperties>({})
  const triggerRef = useRef<HTMLButtonElement>(null)
  const submenuRef = useRef<HTMLDivElement>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Snapshot the trigger's bounding rect and return the submenu CSS vars.
  // Called in event handlers (never during render) so ref access is safe.
  function snapshotSubmenuStyle(): CSSProperties {
    const rect = triggerRef.current?.getBoundingClientRect()
    const x = rect ? rect.right + 2 : 0
    const y = rect ? rect.top : 0
    return {
      '--context-menu-x': `${x}px`,
      '--context-menu-y': `${y}px`,
      '--context-menu-z-index': zIndex + 10,
      '--context-menu-min-width': '176px',
      '--context-menu-width': '176px',
    } as CSSProperties
  }

  // Open submenu: snapshot position, show panel, auto-focus first item via rAF.
  function openSubmenu() {
    setSubmenuStyle(snapshotSubmenuStyle())
    setOpen(true)
    requestAnimationFrame(() => {
      const first = submenuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')
      first?.focus()
    })
  }

  // Schedule a delayed close — cancelled if mouse re-enters trigger or submenu.
  function scheduleClose() {
    closeTimerRef.current = setTimeout(() => {
      setOpen(false)
      closeTimerRef.current = null
    }, 100)
  }

  function cancelClose() {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }

  function handleTriggerClick() {
    if (open) {
      setOpen(false)
    } else {
      openSubmenu()
    }
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      openSubmenu()
    }
  }

  function handleSubmenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowLeft' || event.key === 'Escape') {
      // Close submenu only — stop propagation so parent ContextMenu's
      // Escape handler does NOT fire (closing submenu ≠ closing parent).
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      triggerRef.current?.focus()
      return
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const items = [
        ...(submenuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []),
      ]
      const currentIndex = items.indexOf(document.activeElement as HTMLElement)
      const next = currentIndex + (event.key === 'ArrowDown' ? 1 : -1)
      if (next >= 0 && next < items.length) {
        items[next].focus()
      }
    }
  }

  // Any click inside the submenu panel closes both submenu and parent menu.
  function handleSubmenuClick() {
    setOpen(false)
    onClose?.()
  }

  return (
    <div className={styles.submenuRoot}>
      <Button
        ref={triggerRef}
        variant="ghost"
        size="xs"
        menuItem
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        fullWidth
        align="between"
        className={cn(styles.item, styles.submenuTrigger)}
        onMouseEnter={() => {
          cancelClose()
          openSubmenu()
        }}
        onMouseLeave={scheduleClose}
        onClick={handleTriggerClick}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className={styles.submenuTriggerContent}>
          {icon && <span aria-hidden="true">{icon}</span>}
          {label}
        </span>
        <span aria-hidden="true" className={styles.submenuChevron}>
          <ChevronRightIcon size={10} color="currentColor" />
        </span>
      </Button>
      {open && (
        <div
          ref={submenuRef}
          role="menu"
          aria-label={typeof label === 'string' ? label : undefined}
          className={styles.menu}
          style={submenuStyle}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          onKeyDown={handleSubmenuKeyDown}
          onClick={handleSubmenuClick}
        >
          {children}
        </div>
      )}
    </div>
  )
}
