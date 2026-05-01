/**
 * ModulePickerDropdown — searchable, category-grouped module insertion picker.
 *
 * Opens as a dropdown from the toolbar "+ Add" button.
 * Clicking a module inserts it as a child of the selected node,
 * or at the root node if nothing is selected.
 *
 * Performance notes:
 * - Module list is built once from registry.listByCategory() on open.
 * - Search filtering via useMemo — O(n) sync filter, < 1ms for < 200 modules.
 * - No virtualisation needed for MVP (< 50 base modules).
 * - Dropdown closes on Escape, outside click, and after a successful insert.
 *
 * Accessibility (WCAG 2.1 AA):
 * - role="dialog" + aria-label on overlay
 * - Search input auto-focused on open; focus ring via boxShadow (WCAG SC 2.4.7)
 * - Results list uses role="menu" + role="menuitem" (correct for command list)
 * - Arrow Up/Down keyboard nav between menu items (WCAG SC 2.1.1)
 * - Escape closes (focus returns to trigger button)
 * - aria-expanded on trigger button
 */

import {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
} from 'react'
import { useEditorStore } from '@core/editor-store/store'
import type { Page } from '@core/page-tree/types'
import { registry } from '@core/module-engine/registry'
import type { AnyModuleDefinition } from '@core/module-engine/types'
import { PlusIcon } from '@ui/icons/icons/plus'
import { FilePlusIcon } from '@ui/icons/icons/file-plus'
import { BracesIcon } from '@ui/icons/icons/braces'
import { Button } from '@ui/components/Button'
import { SearchBar } from '@ui/components/SearchBar'
import {
  SiteCreateDialog,
  slugifySiteItemName,
  toPascalCaseSiteItemName,
  type SiteCreatePayload,
  type SiteCreateKind,
} from '../SiteCreateDialog'
import { useInsertModule } from '../../hooks/useInsertModule'
import styles from './Toolbar.module.css'

type ToolbarCreateKind = Extract<SiteCreateKind, 'page' | 'component'>

const EMPTY_PAGES: Page[] = []

interface ModulePickerDropdownProps {
  triggerClassName?: string
  triggerTestId?: string
}

export function ModulePickerDropdown({
  triggerClassName,
  triggerTestId = 'toolbar-add-module-btn',
}: ModulePickerDropdownProps = {}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [createKind, setCreateKind] = useState<ToolbarCreateKind | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const addPage = useEditorStore((s) => s.addPage)
  const pages = useEditorStore((s) => s.site?.pages ?? EMPTY_PAGES)
  const openPageInCanvas = useEditorStore((s) => s.openPageInCanvas)
  const createVisualComponent = useEditorStore((s) => s.createVisualComponent)
  const setActiveDocument = useEditorStore((s) => s.setActiveDocument)
  const insertModule = useInsertModule()

  // ─── Open / close ─────────────────────────────────────────────────────────

  const handleOpen = useCallback(() => {
    setOpen(true)
    setQuery('')
  }, [])

  const handleClose = useCallback(() => {
    setOpen(false)
    triggerRef.current?.focus()
  }, [])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, handleClose])

  // Auto-focus search input when opened
  useEffect(() => {
    if (open) {
      const id = setTimeout(() => searchRef.current?.focus(), 30)
      return () => clearTimeout(id)
    }
  }, [open])

  // ─── Module list + search filter ──────────────────────────────────────────

  const grouped = useMemo<Record<string, AnyModuleDefinition[]>>(() => {
    const all = registry.listByCategory()
    const filtered: Record<string, AnyModuleDefinition[]> = {}
    for (const [cat, mods] of Object.entries(all)) {
      const visible = mods.filter((m) => m.id !== 'base.root')
      if (visible.length > 0) filtered[cat] = visible
    }
    return filtered
  }, [])

  const filteredGrouped = useMemo<Record<string, AnyModuleDefinition[]>>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return grouped
    const result: Record<string, AnyModuleDefinition[]> = {}
    for (const [cat, mods] of Object.entries(grouped)) {
      const matching = mods.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q) ||
          cat.toLowerCase().includes(q),
      )
      if (matching.length > 0) result[cat] = matching
    }
    return result
  }, [grouped, query])

  const totalResults = useMemo(
    () => Object.values(filteredGrouped).reduce((s, arr) => s + arr.length, 0),
    [filteredGrouped],
  )

  // ─── Arrow-key navigation within the menu ─────────────────────────────────

  const handleMenuKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!menuRef.current) return
    const items = Array.from(
      menuRef.current.querySelectorAll<HTMLElement>('[role="menuitem"]')
    )
    if (items.length === 0) return

    const focused = document.activeElement as HTMLElement
    const idx = items.indexOf(focused)

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = idx < items.length - 1 ? idx + 1 : 0
      items[next]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = idx > 0 ? idx - 1 : items.length - 1
      items[prev]?.focus()
    }
  }, [])

  // ─── Insert handler ───────────────────────────────────────────────────────

  const handleInsert = useCallback(
    (mod: AnyModuleDefinition) => {
      if (insertModule(mod)) handleClose()
    },
    [insertModule, handleClose],
  )

  const openCreateAction = useCallback((kind: ToolbarCreateKind) => {
    setCreateKind(kind)
    handleClose()
  }, [handleClose])

  const handleCreateConfirm = useCallback(
    ({ name, slug }: SiteCreatePayload) => {
      if (!createKind) return

      try {
        if (createKind === 'page') {
          const page = addPage(name, slug ?? slugifySiteItemName(name))
          openPageInCanvas(page.id)
        } else {
          const vcId = createVisualComponent(toPascalCaseSiteItemName(name))
          setActiveDocument({ kind: 'visualComponent', vcId })
        }
        setCreateKind(null)
      } catch (err) {
        console.error('[ModulePickerDropdown] handleCreateConfirm error:', err)
      }
    },
    [
      createKind,
      addPage,
      openPageInCanvas,
      createVisualComponent,
      setActiveDocument,
    ],
  )

  const categories = Object.keys(filteredGrouped).sort()

  return (
    <div className={styles.pickerWrapper}>
      {/* Trigger button */}
      <Button
        ref={triggerRef}
        variant="primary"
        size="sm"
        accentFill
        className={triggerClassName}
        aria-label="Add"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Add page, component, or module"
        onClick={handleOpen}
        data-testid={triggerTestId}
      >
        <PlusIcon size={13} />
        Add
      </Button>

      {/* Dropdown panel */}
      {open && (
        <>
          {/* Backdrop — click outside to close */}
          <div
            aria-hidden="true"
            onClick={handleClose}
            className={styles.pickerBackdrop}
          />

          <div
            role="dialog"
            aria-label="Add"
            aria-modal="true"
            className={styles.pickerPanel}
          >
            <div className={styles.pickerActions} aria-label="Create">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openCreateAction('page')}
                data-testid="toolbar-add-page-action"
                fullWidth
              >
                <FilePlusIcon size={14} />
                Page
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openCreateAction('component')}
                data-testid="toolbar-add-component-action"
                fullWidth
              >
                <BracesIcon size={14} />
                Component
              </Button>
            </div>

            <SearchBar
              ref={searchRef}
              placeholder="Search modules…"
              value={query}
              onValueChange={setQuery}
              aria-label="Search modules"
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')
                  first?.focus()
                }
              }}
            />

            {/* Results — role="menu" (correct for command list; UX Review #333) */}
            <div
              ref={menuRef}
              role="menu"
              aria-label="Available modules"
              onKeyDown={handleMenuKeyDown}
              className={styles.pickerMenu}
            >
              {categories.length === 0 ? (
                <p
                  role="status"
                  className={styles.pickerEmpty}
                >
                  No modules match &ldquo;{query}&rdquo;
                </p>
              ) : (
                categories.map((cat) => (
                  <div key={cat}>
                    {/* Category heading — aria-hidden, presentational grouping only */}
                    <div
                      aria-hidden="true"
                      className={styles.pickerCategoryHeading}
                    >
                      {cat}
                    </div>

                    {/* Module options */}
                    {filteredGrouped[cat].map((mod) => (
                      <ModuleOption
                        key={mod.id}
                        mod={mod}
                        onSelect={handleInsert}
                      />
                    ))}
                  </div>
                ))
              )}
            </div>

            {/* Footer — result count */}
            {query && (
              <div
                aria-live="polite"
                className={styles.pickerFooter}
              >
                {totalResults} result{totalResults !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </>
      )}

      {createKind && (
        <SiteCreateDialog
          kind={createKind}
          pages={pages}
          onCancel={() => setCreateKind(null)}
          onCreate={handleCreateConfirm}
        />
      )}
    </div>
  )
}

// ─── ModuleOption — single menu item ──────────────────────────────────────────

interface ModuleOptionProps {
  mod: AnyModuleDefinition
  onSelect: (mod: AnyModuleDefinition) => void
}

function ModuleOption({ mod, onSelect }: ModuleOptionProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(mod)
    }
  }

  return (
    <div
      role="menuitem"
      tabIndex={-1}
      onClick={() => onSelect(mod)}
      onKeyDown={handleKeyDown}
      data-module-id={mod.id}
      className={styles.pickerOption}
    >
      <span
        aria-hidden="true"
        className={styles.pickerOptionBadge}
      >
        {mod.name[0]}
      </span>
      <span>{mod.name}</span>
    </div>
  )
}
