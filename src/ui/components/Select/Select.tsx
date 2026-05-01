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
  type OptionHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import { ContextMenu, ContextMenuItem } from '@ui/components/ContextMenu'
import { ChevronDownIcon } from '@ui/icons/icons/chevron-down'
import { cn } from '@ui/cn'
import styles from './Select.module.css'

type FieldSize = 'xs' | 'sm' | 'md'
type TextEmphasis = 'default' | 'strong'

export interface SelectOption {
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

interface MenuPosition {
  x: number
  y: number
  width: number
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  invalid?: boolean
  fieldSize?: FieldSize
  emphasis?: TextEmphasis
  options?: SelectOption[]
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
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null)

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
  const selectedText = selectedOption?.textValue ?? ''

  const setSelectRef = useCallback(
    (node: HTMLSelectElement | null) => {
      nativeSelectRef.current = node
      assignRef(ref, node)
    },
    [ref],
  )

  const updateMenuPosition = useCallback(() => {
    const rect = selectRef.current?.getBoundingClientRect()
    if (!rect) return
    setMenuPosition({
      x: rect.left,
      y: rect.bottom + 6,
      width: rect.width,
    })
  }, [])

  const closeMenu = useCallback(() => {
    setOpen(false)
    setMenuPosition(null)
  }, [])

  const openMenu = useCallback(() => {
    if (disabled) return
    updateMenuPosition()
    setOpen(true)
  }, [disabled, updateMenuPosition])

  useEffect(() => {
    if (!open) return
    function handleViewportChange() {
      updateMenuPosition()
    }
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)
    return () => {
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
    }
  }, [open, updateMenuPosition])

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

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case 'Enter':
      case ' ':
      case 'ArrowDown':
        event.preventDefault()
        openMenu()
        break
      case 'Escape':
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
        aria-expanded={open}
        aria-haspopup="menu"
        aria-invalid={invalid || props['aria-invalid'] ? true : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        data-testid={dataTestId}
        disabled={disabled}
        readOnly
        value={selectedText}
        onClick={openMenu}
        onChange={handleTriggerChange}
        onKeyDown={handleTriggerKeyDown}
        className={styles.trigger}
      />

      <span aria-hidden="true" className={styles.chevron}>
        <ChevronDownIcon size={12} />
      </span>

      {open && menuPosition && createPortal(
        <ContextMenu
          id={menuId}
          x={menuPosition.x}
          y={menuPosition.y}
          width={menuPosition.width}
          minWidth={menuPosition.width}
          zIndex={10000}
          ariaLabel={ariaLabel ?? 'Select option'}
          onClose={closeMenu}
        >
          {normalizedOptions.map((option) => (
            <ContextMenuItem
              key={option.value}
              active={option.value === selectedValue}
              disabled={option.disabled}
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
