import {
  Children,
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  type OptionHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefObject,
  type SelectHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import { ContextMenu, ContextMenuItem } from '@ui/components/ContextMenu'
import { ChevronDownIcon } from 'pixel-art-icons/icons/chevron-down'
import { cn } from '@ui/cn'
import styles from './Select.module.css'

type FieldSize = 'xs' | 'sm' | 'md'
type TextEmphasis = 'default' | 'strong'
type MenuPlacement = 'bottom-start' | 'left-start'

interface SelectOption {
  value: string | number
  label: ReactNode
  textValue?: string
  icon?: ReactNode
  disabled?: boolean
}

interface NormalizedSelectOption {
  value: string
  label: ReactNode
  textValue: string
  icon?: ReactNode
  disabled?: boolean
}

interface MenuSizing {
  width: number
  minWidth: number
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  invalid?: boolean
  fieldSize?: FieldSize
  emphasis?: TextEmphasis
  menuMinWidth?: number
  menuPlacement?: MenuPlacement
  /**
   * Optional element whose bounding rect provides the dropdown's horizontal
   * anchor (left edge + width). When unset, the trigger's own rect is used.
   *
   * Useful when the trigger is a narrow cell in a multi-column layout but the
   * option labels are too long to fit the cell — the dropdown can span a
   * wider parent (e.g. the full grid row) so labels stay fully readable
   * instead of being truncated to the cell width.
   *
   * Vertical positioning still anchors to the trigger so the menu opens just
   * below it; only the `x` and `width` come from the anchor element.
   *
   * Ignored when `menuPlacement === 'left-start'` (left-anchored placement
   * needs trigger-relative coordinates to stay aligned with the trigger row).
   */
  menuAnchorRef?: RefObject<HTMLElement | null>
  options?: SelectOption[]
  placeholder?: string
  'data-testid'?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    className,
    invalid = false,
    fieldSize = 'md',
    emphasis = 'default',
    options,
    children,
    disabled = false,
    value,
    defaultValue,
    onChange,
    id,
    name,
    required,
    placeholder,
    menuMinWidth,
    menuPlacement = 'bottom-start',
    menuAnchorRef,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
    'data-testid': dataTestId,
    ...props
  },
  ref,
) {
  const generatedId = useId()
  const triggerId = id ?? `select-${generatedId}`
  const menuId = `${triggerId}-menu`
  const normalizedOptions = useMemo(
    () => normalizeOptions(options, children),
    [options, children],
  )
  const firstValue = normalizedOptions[0]?.value ?? ''
  const isControlled = value !== undefined
  const [internalValue, setInternalValue] = useState(() => {
    return stringifySelectValue(defaultValue ?? firstValue)
  })
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [menuSizing, setMenuSizing] = useState<MenuSizing | null>(null)

  const nativeSelectRef = useRef<HTMLSelectElement | null>(null)
  const selectRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLInputElement | null>(null)

  const rawSelectedValue = stringifySelectValue(isControlled ? value : internalValue)
  const selectedValue = normalizedOptions.some((option) => option.value === rawSelectedValue)
    ? rawSelectedValue
    : firstValue
  const selectedOption =
    normalizedOptions.find((option) => option.value === selectedValue) ??
    normalizedOptions[0]
  const showPlaceholder = rawSelectedValue === '' && hasTextValue(placeholder)
  const selectedText = showPlaceholder ? '' : (selectedOption?.textValue ?? '')
  const resolvedActiveIndex =
    open && isEnabledOptionIndex(normalizedOptions, activeIndex)
      ? activeIndex
      : getInitialActiveIndex(normalizedOptions, selectedValue)
  const activeOptionId =
    open && resolvedActiveIndex >= 0 ? getOptionId(menuId, resolvedActiveIndex) : undefined

  const setSelectRef = useCallback(
    (node: HTMLSelectElement | null) => {
      nativeSelectRef.current = node
      assignRef(ref, node)
    },
    [ref],
  )

  // The anchor element used for the dropdown's positioning + width. For
  // 'bottom-start' a caller may provide a wider anchor (e.g. a multi-cell
  // grid row) so the menu can extend past the trigger; 'left-start' always
  // anchors to the trigger so the menu lines up with the field's top edge.
  //
  // We resolve which ref to use at open-time (not render-time) because
  // parent refs may not yet be populated on the first render — the
  // `menuAnchorRef` is typically set by a `<div ref={menuAnchorRef}>` in
  // the parent that is committed after this component renders.
  const resolvedAnchorRef = useRef<HTMLElement | null>(null)

  const resolveActiveAnchor = useCallback((): HTMLElement | null => {
    if (menuPlacement !== 'left-start' && menuAnchorRef?.current != null) {
      return menuAnchorRef.current
    }
    return selectRef.current
  }, [menuAnchorRef, menuPlacement])

  const updateMenuSizing = useCallback(() => {
    const anchor = resolvedAnchorRef.current ?? resolveActiveAnchor()
    if (!anchor) return
    resolvedAnchorRef.current = anchor
    const anchorRect = anchor.getBoundingClientRect()
    const resolvedMinWidth = menuMinWidth ?? anchorRect.width
    const resolvedWidth = Math.max(anchorRect.width, resolvedMinWidth)
    setMenuSizing({ width: resolvedWidth, minWidth: resolvedMinWidth })
  }, [menuMinWidth, resolveActiveAnchor])

  const closeMenu = useCallback(() => {
    setOpen(false)
    setActiveIndex(-1)
    setMenuSizing(null)
    resolvedAnchorRef.current = null
  }, [])

  const openMenu = useCallback(() => {
    if (disabled) return
    // Resolve which element to anchor to (parent grid vs trigger) and
    // capture the choice for the duration of the open menu.
    resolvedAnchorRef.current = resolveActiveAnchor()
    updateMenuSizing()
    setActiveIndex(getInitialActiveIndex(normalizedOptions, selectedValue))
    setOpen(true)
  }, [disabled, normalizedOptions, resolveActiveAnchor, selectedValue, updateMenuSizing])

  useEffect(() => {
    if (!open) return
    function handleViewportChange() {
      updateMenuSizing()
    }
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)
    return () => {
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
    }
  }, [open, updateMenuSizing])

  const commitValue = useCallback(
    (nextValue: string) => {
      if (disabled) return
      if (!isControlled) setInternalValue(nextValue)
      closeMenu()

      const select = nativeSelectRef.current
      if (select) select.value = nextValue
      onChange?.({
        target: select ?? ({ value: nextValue, name } as HTMLSelectElement),
        currentTarget: select ?? ({ value: nextValue, name } as HTMLSelectElement),
      } as ChangeEvent<HTMLSelectElement>)
      requestAnimationFrame(() => triggerRef.current?.focus())
    },
    [closeMenu, disabled, isControlled, name, onChange],
  )

  function handleNativeChange(event: ChangeEvent<HTMLSelectElement>) {
    if (!isControlled) setInternalValue(event.target.value)
    onChange?.(event)
  }

  function handleTriggerChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.value
    const matchingOption = normalizedOptions.find(
      (option) => option.value === next || option.textValue === next,
    )
    if (matchingOption && !matchingOption.disabled) {
      commitValue(matchingOption.value)
    }
  }

  function handleSelectClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target
    if (
      event.defaultPrevented ||
      disabled ||
      !(target instanceof Node) ||
      !selectRef.current?.contains(target)
    ) {
      return
    }
    triggerRef.current?.focus()
    openMenu()
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        if (!open) {
          openMenu()
        } else {
          setActiveIndex(getNextEnabledOptionIndex(normalizedOptions, resolvedActiveIndex, 1))
        }
        break
      case 'ArrowUp':
        event.preventDefault()
        if (!open) {
          openMenu()
        } else {
          setActiveIndex(getNextEnabledOptionIndex(normalizedOptions, resolvedActiveIndex, -1))
        }
        break
      case 'Home':
        if (!open) return
        event.preventDefault()
        setActiveIndex(getFirstEnabledOptionIndex(normalizedOptions))
        break
      case 'End':
        if (!open) return
        event.preventDefault()
        setActiveIndex(getLastEnabledOptionIndex(normalizedOptions))
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        if (!open) {
          openMenu()
        } else if (isEnabledOptionIndex(normalizedOptions, resolvedActiveIndex)) {
          commitValue(normalizedOptions[resolvedActiveIndex].value)
        }
        break
      case 'Escape':
        event.preventDefault()
        closeMenu()
        break
      case 'Tab':
        closeMenu()
        break
    }
  }

  return (
    <div
      ref={selectRef}
      className={cn(
        styles.select,
        styles[`size-${fieldSize}`],
        invalid && styles.invalid,
        disabled && styles.disabled,
        className,
      )}
      data-emphasis={emphasis !== 'default' ? emphasis : undefined}
      data-open={open ? 'true' : undefined}
      onClick={handleSelectClick}
    >
      <select
        ref={setSelectRef}
        id={`${triggerId}-native`}
        name={name}
        required={required}
        disabled={disabled}
        value={selectedValue}
        onChange={handleNativeChange}
        tabIndex={-1}
        aria-hidden="true"
        className={styles.nativeSelect}
        {...props}
      >
        {options ? (
          normalizedOptions.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.textValue}
            </option>
          ))
        ) : children}
      </select>

      {selectedOption?.icon && (
        <span aria-hidden="true" className={styles.leadingIcon}>
          <SelectIcon icon={selectedOption.icon} />
        </span>
      )}

      <input
        ref={triggerRef}
        id={triggerId}
        role="combobox"
        aria-controls={open ? menuId : undefined}
        aria-activedescendant={activeOptionId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-invalid={invalid || props['aria-invalid'] ? true : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        data-testid={dataTestId}
        data-placeholder={showPlaceholder ? 'true' : undefined}
        disabled={disabled}
        readOnly
        value={selectedText}
        placeholder={placeholder}
        onChange={handleTriggerChange}
        onKeyDown={handleTriggerKeyDown}
        className={styles.trigger}
      />

      <span aria-hidden="true" className={styles.chevron}>
        <ChevronDownIcon size={12} />
      </span>

      {open && menuSizing && createPortal(
        <ContextMenu
          id={menuId}
          anchorRef={resolvedAnchorRef}
          side={menuPlacement === 'left-start' ? 'left' : 'auto'}
          align="start"
          offset={6}
          width={menuSizing.width}
          minWidth={menuSizing.minWidth}
          zIndex={10000}
          ariaLabel={ariaLabel ?? 'Select option'}
          aria-labelledby={ariaLabelledBy}
          role="listbox"
          onClose={closeMenu}
        >
          {normalizedOptions.map((option, index) => (
            <ContextMenuItem
              key={option.value}
              id={getOptionId(menuId, index)}
              active={index === resolvedActiveIndex}
              role="option"
              aria-selected={option.value === selectedValue}
              disabled={option.disabled}
              tabIndex={-1}
              onMouseEnter={() => {
                if (!option.disabled) setActiveIndex(index)
              }}
              onClick={() => commitValue(option.value)}
            >
              {option.icon && (
                <span aria-hidden="true">
                  {option.icon}
                </span>
              )}
              <span className={styles.optionLabel}>{option.label}</span>
            </ContextMenuItem>
          ))}
        </ContextMenu>,
        document.body,
      )}
    </div>
  )
})

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) return
  if (typeof ref === 'function') {
    ref(value)
  } else {
    ref.current = value
  }
}

function stringifySelectValue(value: unknown): string {
  if (Array.isArray(value)) return stringifySelectValue(value[0])
  if (value === undefined || value === null) return ''
  return String(value)
}

function hasTextValue(value: unknown): value is string {
  return typeof value === 'string' && value !== ''
}

function normalizeOptions(options: SelectOption[] | undefined, children: ReactNode): NormalizedSelectOption[] {
  if (options) {
    return options.map((option) => ({
      ...option,
      value: stringifySelectValue(option.value),
      textValue: option.textValue ?? getNodeText(option.label),
    }))
  }
  return Children.toArray(children).flatMap(optionFromChild)
}

function optionFromChild(child: ReactNode): NormalizedSelectOption[] {
  if (!isValidElement(child)) return []
  if (child.type === 'optgroup') {
    const props = child.props as { children?: ReactNode }
    return Children.toArray(props.children).flatMap(optionFromChild)
  }
  if (child.type !== 'option') return []

  const option = child as ReactElement<OptionHTMLAttributes<HTMLOptionElement>>
  const textValue = getNodeText(option.props.children)
  return [{
    value: stringifySelectValue(option.props.value ?? textValue),
    label: option.props.children,
    textValue,
    disabled: option.props.disabled,
  }]
}

function getOptionId(menuId: string, index: number) {
  return `${menuId}-option-${index}`
}

function isEnabledOptionIndex(options: NormalizedSelectOption[], index: number) {
  return index >= 0 && index < options.length && !options[index].disabled
}

function getFirstEnabledOptionIndex(options: NormalizedSelectOption[]) {
  return options.findIndex((option) => !option.disabled)
}

function getLastEnabledOptionIndex(options: NormalizedSelectOption[]) {
  for (let index = options.length - 1; index >= 0; index--) {
    if (!options[index].disabled) return index
  }
  return -1
}

function getInitialActiveIndex(options: NormalizedSelectOption[], selectedValue: string) {
  const selectedIndex = options.findIndex(
    (option) => option.value === selectedValue && !option.disabled,
  )
  return selectedIndex >= 0 ? selectedIndex : getFirstEnabledOptionIndex(options)
}

function getNextEnabledOptionIndex(
  options: NormalizedSelectOption[],
  currentIndex: number,
  direction: 1 | -1,
) {
  if (options.length === 0) return -1
  const startIndex = currentIndex >= 0 ? currentIndex : direction > 0 ? -1 : options.length

  for (let step = 1; step <= options.length; step++) {
    const nextIndex = (startIndex + direction * step + options.length) % options.length
    if (!options[nextIndex].disabled) return nextIndex
  }

  return -1
}

function getNodeText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(getNodeText).join('')
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode }
    return getNodeText(props.children)
  }
  return ''
}

function SelectIcon({ icon }: { icon: ReactNode }) {
  return icon
}
