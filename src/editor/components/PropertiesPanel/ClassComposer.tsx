/**
 * ClassComposer — CSS section content renderer for a single class.
 *
 * Renders the style property sections for the given class filtered by
 * activeStyleSectionId and styleQuery. The rail, search bar, and section
 * navigation are owned by the parent (StyleSurface).
 */

import { useCallback } from 'react'
import { useEditorStore } from '@core/editor-store/store'
import type { CSSClass, CSSPropertyBag } from '@core/page-tree/schemas'
import { ClassPropertyRow } from './ClassPropertyRow'
import { Section } from './Section'
import { SpacingBoxControl } from './SpacingBoxControl/SpacingBoxControl'
import {
  CLASS_STYLE_SECTIONS,
  cssPropertyLabel,
  getCSSPropertyDefaultValue,
  getActiveStyleTab,
  type ClassStyleSectionDefinition,
} from './cssControlTypes'
import styles from './ClassComposer.module.css'
import sectionStyles from './Section.module.css'

const SPACING_SECTION_ID = 'spacing'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ClassComposerProps {
  classId: string
  cls: CSSClass
  /** Search query — filters visible properties across all categories. */
  styleQuery: string
  mode?: 'contextual' | 'global'
}

// ---------------------------------------------------------------------------
// ClassComposer
// ---------------------------------------------------------------------------

export function ClassComposer({
  classId,
  cls,
  styleQuery,
  mode: _mode = 'contextual',
}: ClassComposerProps) {
  const activeBreakpointId = useEditorStore((s) => s.activeBreakpointId)
  const updateClassStyles = useEditorStore((s) => s.updateClassStyles)
  const setClassBreakpointStyles = useEditorStore((s) => s.setClassBreakpointStyles)
  const setPreviewClassStyles = useEditorStore((s) => s.setPreviewClassStyles)
  const clearPreviewClassStyles = useEditorStore((s) => s.clearPreviewClassStyles)

  const activeTab = getActiveStyleTab(activeBreakpointId)

  const storedStyles: Record<string, unknown> = activeTab !== 'base'
    ? (cls.breakpointStyles[activeTab] ?? {})
    : cls.styles
  const currentStyles: Record<string, unknown> = activeTab !== 'base'
    ? { ...cls.styles, ...storedStyles }
    : cls.styles

  const visibleStyleSections = getVisibleStyleSections(styleQuery)

  const handleChange = useCallback(
    (key: keyof CSSPropertyBag, value: string | number | undefined) => {
      const patch = { [key]: value ?? null } as Partial<CSSPropertyBag>
      if (activeTab !== 'base') {
        setClassBreakpointStyles(classId, activeTab, patch)
      } else {
        updateClassStyles(classId, patch)
      }
    },
    [classId, activeTab, updateClassStyles, setClassBreakpointStyles],
  )

  const handleRemoveProperty = useCallback(
    (key: keyof CSSPropertyBag) => {
      handleChange(key, undefined)
    },
    [handleChange],
  )

  // Preview a transient style patch on the canvas while a property
  // control's hover-suggestion menu is open. The preview lives entirely
  // in store UI state — no class document mutation, no history entry.
  const handlePreview = useCallback(
    (patch: Partial<CSSPropertyBag>) => {
      setPreviewClassStyles({
        classId,
        breakpointId: activeTab !== 'base' ? activeTab : null,
        styles: patch,
      })
    },
    [classId, activeTab, setPreviewClassStyles],
  )

  const handleClearPreview = useCallback(() => {
    clearPreviewClassStyles(classId)
  }, [classId, clearPreviewClassStyles])

  return (
    <div className={styles.styleSections}>
      {visibleStyleSections.map((section) => (
        <div key={section.id} data-style-section={section.id}>
          <ClassStyleSection
            section={section}
            currentStyles={currentStyles}
            storedStyles={storedStyles}
            activeTab={activeTab}
            onChange={handleChange}
            onRemove={handleRemoveProperty}
            onPreview={handlePreview}
            onClearPreview={handleClearPreview}
          />
        </div>
      ))}
      {visibleStyleSections.length === 0 && (
        <div className={styles.noStyleMatches}>No matching styles.</div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ClassStyleSection
// ---------------------------------------------------------------------------

interface ClassStyleSectionProps {
  section: ClassStyleSectionDefinition
  currentStyles: Record<string, unknown>
  storedStyles: Record<string, unknown>
  activeTab: string
  onChange: (property: keyof CSSPropertyBag, value: string | number | undefined) => void
  onRemove: (property: keyof CSSPropertyBag) => void
  onPreview: (patch: Partial<CSSPropertyBag>) => void
  onClearPreview: () => void
}

function ClassStyleSection({
  section,
  currentStyles,
  storedStyles,
  activeTab,
  onChange,
  onRemove,
  onPreview,
  onClearPreview,
}: ClassStyleSectionProps) {
  const setCount = section.properties.filter((prop) => hasStyleValue(storedStyles[prop])).length

  return (
    <Section
      title={section.title}
      icon={section.icon}
      defaultOpen
      indicator={setCount > 0}
      indicatorTestId={`class-style-section-dot-${section.id}`}
      meta={setCount > 0 ? `${setCount} set` : undefined}
    >
      <div className={sectionStyles.sectionBody}>
        {section.id === SPACING_SECTION_ID ? (
          // Spacing section uses a single visual box-model widget instead of
          // a stack of 10 padding/margin rows. The widget owns shorthand
          // collapse and writes through the same onChange/onRemove pipeline.
          <SpacingBoxControl
            key={activeTab}
            storedStyles={storedStyles}
            currentStyles={currentStyles}
            onChange={onChange}
            onRemove={onRemove}
            onPreview={onPreview}
            onClearPreview={onClearPreview}
          />
        ) : (
          section.properties.map((prop) => {
            const storedValue = storedStyles[prop]
            const isSet = hasStyleValue(storedValue)
            const currentValue = currentStyles[prop]
            const fallbackValue = hasStyleValue(currentValue)
              ? currentValue
              : getCSSPropertyDefaultValue(prop)

            return (
              <ClassPropertyRow
                key={`${activeTab}-${String(prop)}`}
                property={prop}
                // storedValue is narrowed to string | number by the isSet guard above
                value={isSet ? (storedValue as string | number) : undefined}
                placeholder={!isSet ? fallbackValue : undefined}
                isSet={isSet}
                onChange={onChange}
                onRemove={onRemove}
              />
            )
          })
        )}
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function getVisibleStyleSections(
  query: string,
): ReadonlyArray<ClassStyleSectionDefinition> {
  const normalizedQuery = query.trim().toLowerCase()

  return CLASS_STYLE_SECTIONS
    .map((section) => ({
      ...section,
      properties: section.properties.filter(
        (prop) =>
          !normalizedQuery ||
          sectionMatchesQuery(section, normalizedQuery) ||
          propertyMatchesQuery(prop, normalizedQuery),
      ),
    }))
    .filter((section) => section.properties.length > 0)
}

function sectionMatchesQuery(section: ClassStyleSectionDefinition, query: string): boolean {
  return section.id.toLowerCase().includes(query) || section.title.toLowerCase().includes(query)
}

function propertyMatchesQuery(prop: keyof CSSPropertyBag, query: string): boolean {
  const raw = String(prop).toLowerCase()
  const label = cssPropertyLabel(String(prop)).toLowerCase()
  return raw.includes(query) || label.includes(query)
}

function hasStyleValue(value: unknown): value is string | number {
  return value !== undefined && value !== null && value !== ''
}
