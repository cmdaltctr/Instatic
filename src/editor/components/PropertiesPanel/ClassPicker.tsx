/**
 * ClassPicker — always-visible class pill manager.
 *
 * Replaces ClassesTab in the Properties Panel redesign (Spec #659 §2).
 * Now permanently visible (no tab click required — PP-2 acceptance criterion).
 *
 * Changes vs. ClassesTab:
 *   - Pill cascade order badges (¹²³) — PP-7
 *   - Pill reorder buttons (↑/↓) visible on hover/focus — PP-8
 *   - Pill × has title="Remove from this element" — PP-9
 *   - Class assignment UI lives directly under the selected element header
 *   - Uses reorderNodeClass store action (new in classSlice — Task #456)
 *
 * Architecture:
 *   - Always mounted when a node is selected (PropertiesPanel renders it unconditionally)
 *   - Active class styling is rendered by PropertiesPanel below the header class strip
 *   - Guideline #242: reorderNodeClass no-ops at array boundaries
 *   - Guideline #350: @motion/icons only; CloseIcon for × button
 *   - Constraint #451: X/Twitter logo icon is prohibited (use CloseIcon for × buttons)
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useEditorStore } from '../../../core/editor-store/store'
import {
  readClassHoverPreviewPreference,
  subscribeToEditorPrefsChanged,
} from '../../preferences/editorPreferences'
import { Button } from '@ui/components/Button'
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuSeparator,
} from '@ui/components/ContextMenu'
import { Input } from '@ui/components/Input'
import { ChevronUpIcon } from '@ui/icons/icons/chevron-up'
import { ChevronDownIcon } from '@ui/icons/icons/chevron-down'
import { CloseIcon } from '@ui/icons/icons/close'
import { cn } from '@ui/cn'
import { isUserVisibleClass } from '../../../core/page-tree/classUtils'
import styles from './ClassPicker.module.css'

// ---------------------------------------------------------------------------
// Superscript badge helper — converts 1 → '¹', 2 → '²', etc.
// ---------------------------------------------------------------------------

const SUPERSCRIPTS: readonly string[] = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹']

interface SuggestionsPosition {
  x: number
  y: number
  width: number
}

function toSuperscript(n: number): string {
  return String(n)
    .split('')
    .map((d) => SUPERSCRIPTS[parseInt(d)] ?? d)
    .join('')
}

// ---------------------------------------------------------------------------
// ClassPicker
// ---------------------------------------------------------------------------

interface ClassPickerProps {
  nodeId: string
}

export function ClassPicker({ nodeId }: ClassPickerProps) {
  const site = useEditorStore((s) => s.site)
  const node = useEditorStore(
    useCallback(
      (s) => s.site?.pages.find((p) => p.nodes[nodeId])?.nodes[nodeId] ?? null,
      [nodeId],
    ),
  )
  const activeClassId = useEditorStore((s) => s.activeClassId)
  const setActiveClass = useEditorStore((s) => s.setActiveClass)
  const addNodeClass = useEditorStore((s) => s.addNodeClass)
  const removeNodeClass = useEditorStore((s) => s.removeNodeClass)
  const createClass = useEditorStore((s) => s.createClass)
  const reorderNodeClass = useEditorStore((s) => s.reorderNodeClass)
  const setPreviewNodeClass = useEditorStore((s) => s.setPreviewNodeClass)
  const clearPreviewNodeClass = useEditorStore((s) => s.clearPreviewNodeClass)

  const [query, setQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestionsPosition, setSuggestionsPosition] = useState<SuggestionsPosition | null>(null)
  const [classHoverPreviewEnabled, setClassHoverPreviewEnabled] = useState(
    readClassHoverPreviewPreference,
  )

  const inputRef = useRef<HTMLInputElement>(null)

  const assignedIds = node?.classIds ?? []
  const visibleAssignedIds = assignedIds.filter((id) => isUserVisibleClass(site?.classes[id]))
  const allClasses = Object.values(site?.classes ?? {}).filter(isUserVisibleClass)

  const suggestions = allClasses.filter(
    (c) =>
      !assignedIds.includes(c.id) &&
      c.name.toLowerCase().includes(query.toLowerCase()),
  )

  const canCreateNew =
    query.trim().length > 0 &&
    !allClasses.some((c) => c.name === query.trim())

  const updateSuggestionsPosition = useCallback(() => {
    const rect = inputRef.current?.getBoundingClientRect()
    if (!rect) return
    setSuggestionsPosition({
      x: rect.left,
      y: rect.bottom + 6,
      width: rect.width,
    })
  }, [])

  const openSuggestions = useCallback(() => {
    updateSuggestionsPosition()
    setShowSuggestions(true)
  }, [updateSuggestionsPosition])

  const handleAddExisting = useCallback(
    (classId: string) => {
      addNodeClass(nodeId, classId)
      clearPreviewNodeClass(nodeId, classId)
      setQuery('')
      setShowSuggestions(false)
      setSuggestionsPosition(null)
    },
    [nodeId, addNodeClass, clearPreviewNodeClass],
  )

  const handleCreateAndAdd = useCallback(() => {
    const name = query.trim()
    if (!name) return
    try {
      const newClass = createClass(name)
      addNodeClass(nodeId, newClass.id)
      setActiveClass(newClass.id)
      clearPreviewNodeClass(nodeId)
      setQuery('')
      setShowSuggestions(false)
      setSuggestionsPosition(null)
    } catch {
      // Class with this name already exists
    }
  }, [query, createClass, addNodeClass, nodeId, setActiveClass, clearPreviewNodeClass])

  const previewClass = useCallback(
    (classId: string) => {
      if (!classHoverPreviewEnabled) return
      setPreviewNodeClass(nodeId, classId)
    },
    [classHoverPreviewEnabled, nodeId, setPreviewNodeClass],
  )

  const clearPreviewClass = useCallback(
    (classId: string) => {
      clearPreviewNodeClass(nodeId, classId)
    },
    [clearPreviewNodeClass, nodeId],
  )

  useEffect(() => {
    return subscribeToEditorPrefsChanged(() => {
      setClassHoverPreviewEnabled(readClassHoverPreviewPreference())
    })
  }, [])

  useEffect(() => {
    if (!classHoverPreviewEnabled) clearPreviewNodeClass(nodeId)
  }, [classHoverPreviewEnabled, clearPreviewNodeClass, nodeId])

  useEffect(() => () => clearPreviewNodeClass(nodeId), [clearPreviewNodeClass, nodeId])

  useEffect(() => {
    if (!showSuggestions) return
    function onViewportChange() {
      updateSuggestionsPosition()
    }
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onViewportChange, true)
    return () => {
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('scroll', onViewportChange, true)
    }
  }, [showSuggestions, updateSuggestionsPosition])

  const closeSuggestions = useCallback(() => {
    clearPreviewNodeClass(nodeId)
    setShowSuggestions(false)
    setSuggestionsPosition(null)
  }, [clearPreviewNodeClass, nodeId])

  return (
    <div className={styles.container}>
      {/* Assigned class pills with cascade badges and reorder buttons */}
      {visibleAssignedIds.length > 0 && (
        <div className={styles.pillsContainer}>
          {visibleAssignedIds.map((id, idx) => {
            const cls = site?.classes[id]
            if (!cls) return null
            const isActive = activeClassId === id
            return (
              <div
                key={id}
                className={cn(styles.pill, isActive ? styles.pillActive : styles.pillInactive)}
                onClick={() => {
                  setActiveClass(isActive ? null : id)
                }}
                role="button"
                aria-pressed={isActive}
                aria-label={`${isActive ? 'Deselect' : 'Edit'} class ${cls.name}`}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setActiveClass(isActive ? null : id)
                  }
                }}
              >
                {/* Cascade order badge (1-based position = cascade priority) */}
                <span className={styles.pillOrder} aria-hidden="true">
                  {toSuperscript(idx + 1)}
                </span>
                <span className={styles.pillName}>{cls.name}</span>

                {/* Reorder buttons — visible on pill hover/focus-within (CSS).
                    Buttons are natively focusable — tabIndex NOT suppressed (WCAG 2.1.1). */}
                <span className={styles.reorderGroup}>
                  <Button
                    variant="ghost"
                    size="micro"
                    iconOnly
                    onClick={(e) => {
                      e.stopPropagation()
                      reorderNodeClass(nodeId, id, 'up')
                    }}
                    aria-label={`Move class ${cls.name} up in cascade`}
                  >
                    <ChevronUpIcon size={8} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="micro"
                    iconOnly
                    onClick={(e) => {
                      e.stopPropagation()
                      reorderNodeClass(nodeId, id, 'down')
                    }}
                    aria-label={`Move class ${cls.name} down in cascade`}
                  >
                    <ChevronDownIcon size={8} />
                  </Button>
                </span>

                {/* Remove from this element (does NOT delete the class globally) */}
                <Button
                  variant="ghost"
                  size="micro"
                  iconOnly
                  onClick={(e) => {
                    e.stopPropagation()
                    if (isActive) setActiveClass(null)
                    removeNodeClass(nodeId, id)
                  }}
                  aria-label={`Remove class ${cls.name}`}
                  title="Remove from this element"
                  dangerHover
                  className={styles.pillRemoveBtn}
                >
                  <CloseIcon size={10} color="currentColor" aria-hidden="true" />
                </Button>
              </div>
            )
          })}
        </div>
      )}

      {/* Add class input */}
      <div className={styles.inputWrap}>
        <Input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            openSuggestions()
          }}
          onFocus={openSuggestions}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (canCreateNew) handleCreateAndAdd()
              else if (suggestions[0]) handleAddExisting(suggestions[0].id)
            }
            if (e.key === 'Escape') closeSuggestions()
          }}
          placeholder="Add or create class…"
          aria-label="Add or create a CSS class"
        />

        {/* Suggestions dropdown */}
        {showSuggestions && suggestionsPosition && (query.length > 0 || suggestions.length > 0) && createPortal(
          <ContextMenu
            x={suggestionsPosition.x}
            y={suggestionsPosition.y}
            width={suggestionsPosition.width}
            minWidth={suggestionsPosition.width}
            zIndex={10000}
            ariaLabel="Class suggestions"
            onClose={closeSuggestions}
          >
            {suggestions.map((cls) => (
              <ContextMenuItem
                key={cls.id}
                onClick={() => handleAddExisting(cls.id)}
                onMouseEnter={() => previewClass(cls.id)}
                onFocus={() => previewClass(cls.id)}
                onMouseLeave={() => clearPreviewClass(cls.id)}
                onBlur={() => clearPreviewClass(cls.id)}
              >
                {cls.name}
              </ContextMenuItem>
            ))}
            {canCreateNew && (
              <>
                {suggestions.length > 0 && <ContextMenuSeparator />}
                <ContextMenuItem
                  onClick={handleCreateAndAdd}
                >
                  + Create &ldquo;{query.trim()}&rdquo;
                </ContextMenuItem>
              </>
            )}
            {suggestions.length === 0 && !canCreateNew && (
              <div className={styles.noMatch}>
                No classes match &ldquo;{query}&rdquo;
              </div>
            )}
          </ContextMenu>,
          document.body,
        )}
      </div>
    </div>
  )
}
