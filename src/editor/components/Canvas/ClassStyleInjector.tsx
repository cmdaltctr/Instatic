/**
 * ClassStyleInjector — injects/updates user class CSS into the document
 * whenever the site's class registry changes.
 *
 * This is a pure side-effect component (renders null). It subscribes to
 * `site.classes` via a stable selector and imperatively manages a single
 * <style id="mc-classes"> element in document.head.
 *
 * Architecture:
 * - One <style> tag, kept in sync on every class registry change.
 * - CSS is generated from CSSPropertyBag by camelCase → kebab-case conversion.
 * - @media blocks are emitted for breakpoint overrides (uses site.breakpoints).
 * - No FOUC: the style element is created synchronously before first paint.
 *
 * Security (Constraint #228):
 * - Property names are validated against an allowlist (camelCase CSS properties).
 * - Values are sanitised via the canonical sanitiseCssValue() from publisher/utils.
 * - Only known CSS property names from CSSPropertyBag interface are emitted.
 *
 * Performance:
 * - Subscribes with a shallow-equality selector so re-renders only happen when
 *   classes actually change (not on every site edit).
 */

import { useEffect } from 'react'
import { useEditorStore } from '@core/editor-store/store'
import { generateCanvasClassCSS, generatePreviewClassCSS } from './canvasClassCss'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const STYLE_TAG_ID = 'mc-classes'
const PREVIEW_STYLE_TAG_ID = 'mc-classes-preview'

/**
 * Stable empty array used as the ?? fallback for breakpoints selector.
 * Must be module-scope so it's reference-stable across renders — an inline `?? []`
 * literal creates a new array instance on every call, forcing unnecessary re-renders
 * (Guideline #239 — Zustand selectors must not use inline ?? [] / ?? {} fallbacks).
 */
const EMPTY_BREAKPOINTS: Array<{ id: string; width: number }> = []

export function ClassStyleInjector() {
  // Subscribe to class registry — shallow equality so we only re-run when
  // the classes object reference changes (Immer always creates a new ref on mutation)
  const classes = useEditorStore((s) => s.site?.classes ?? null)
  const breakpoints = useEditorStore((s) => s.site?.breakpoints ?? EMPTY_BREAKPOINTS)
  const frameworkColors = useEditorStore((s) => s.site?.settings.framework?.colors ?? null)
  const frameworkTypography = useEditorStore((s) => s.site?.settings.framework?.typography ?? null)
  const frameworkSpacing = useEditorStore((s) => s.site?.settings.framework?.spacing ?? null)
  const frameworkPreferences = useEditorStore((s) => s.site?.settings.framework?.preferences ?? null)
  const fonts = useEditorStore((s) => s.site?.settings.fonts ?? null)
  const previewClassStyles = useEditorStore((s) => s.previewClassStyles)

  useEffect(() => {
    // Get or create the <style> element
    let styleEl = document.getElementById(STYLE_TAG_ID) as HTMLStyleElement | null
    if (!styleEl) {
      styleEl = document.createElement('style')
      styleEl.id = STYLE_TAG_ID
      styleEl.setAttribute('data-source', 'ClassStyleInjector')
      document.head.appendChild(styleEl)
    }

    if (!classes || Object.keys(classes).length === 0) {
      styleEl.textContent =
        generateCanvasClassCSS(
          {},
          breakpoints,
          frameworkColors,
          frameworkTypography,
          frameworkSpacing,
          frameworkPreferences,
          fonts,
        ) || '/* no classes */'
      return
    }

    styleEl.textContent = generateCanvasClassCSS(
      classes,
      breakpoints,
      frameworkColors,
      frameworkTypography,
      frameworkSpacing,
      frameworkPreferences,
      fonts,
    )
  }, [classes, breakpoints, frameworkColors, frameworkTypography, frameworkSpacing, frameworkPreferences, fonts])

  // Preview overlay — a higher-specificity rule emitted while a user is
  // hovering a suggestion in a property control (e.g. spacing token
  // dropdown). Lives in its own <style> tag so it can be toggled cleanly
  // without re-running the main class-CSS generation.
  useEffect(() => {
    let previewEl = document.getElementById(PREVIEW_STYLE_TAG_ID) as HTMLStyleElement | null
    if (!previewClassStyles) {
      if (previewEl) previewEl.textContent = ''
      return
    }
    if (!previewEl) {
      previewEl = document.createElement('style')
      previewEl.id = PREVIEW_STYLE_TAG_ID
      previewEl.setAttribute('data-source', 'ClassStyleInjector:preview')
      document.head.appendChild(previewEl)
    }
    const cls = classes?.[previewClassStyles.classId]
    if (!cls) {
      previewEl.textContent = ''
      return
    }
    previewEl.textContent = generatePreviewClassCSS(cls, {
      breakpointId: previewClassStyles.breakpointId ?? null,
      styles: previewClassStyles.styles,
    })
  }, [classes, previewClassStyles])

  // Cleanup: remove the style elements when the component unmounts
  useEffect(() => {
    return () => {
      document.getElementById(STYLE_TAG_ID)?.remove()
      document.getElementById(PREVIEW_STYLE_TAG_ID)?.remove()
    }
  }, [])

  return null
}
