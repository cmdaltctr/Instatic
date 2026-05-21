/**
 * UserStylesheetInjector — mirrors `ClassStyleInjector` for user-authored
 * stylesheets that live in `site.files[type === 'style']`.
 *
 * Whatever the publisher emits to `userStyles.<hash>.css` for the live site,
 * we inject into the editor canvas via a single
 * `<style id="mc-user-styles">` tag so authors see the same cascade in the
 * editor preview as visitors get on the published page.
 *
 * Architecture:
 * - One <style> tag, updated whenever any user stylesheet's content changes.
 * - Concatenation order is by `path` (ASCII, ascending) — same rule as
 *   `collectUserStylesheetCss` in the publisher so the canvas and the live
 *   site agree on cascade order between user files.
 * - Mounted AFTER `ClassStyleInjector` so user-authored rules win specificity
 *   ties against the class registry — same source-order behaviour as
 *   `<link rel="stylesheet">` emission for the published page.
 *
 * Performance:
 * - Subscribes via a derived selector that emits only on file-content change.
 *   The store's `site.files` reference rotates on any Immer mutation, but
 *   most edits (e.g. renaming a class) don't touch files at all — so the
 *   derived selector usually returns the same string and React skips the
 *   effect.
 */

import { useEffect, useMemo } from 'react'
import { useEditorStore } from '@site/store/store'
import type { SiteFile } from '@core/files/schemas'
import { scopeUserStylesheetForCanvas } from './scopeUserStylesheetForCanvas'

const STYLE_TAG_ID = 'mc-user-styles'

// Reference-stable empty array for the ?? fallback — matches the pattern used
// in ClassStyleInjector. An inline `?? []` would create a new array per
// render and force the useMemo below to re-run every time.
const EMPTY_FILES: readonly SiteFile[] = []

export function UserStylesheetInjector() {
  const files = useEditorStore((s) => s.site?.files ?? EMPTY_FILES)

  // Concatenate user stylesheets in stable path order. Memoised on the files
  // array reference so the effect skips when nothing relevant changed.
  // Mirrors `collectUserStylesheetCss` (server-side) for ordering, then runs
  // each file's body through `scopeUserStylesheetForCanvas` so bare `body`
  // selectors target the page-body wrapper inside each breakpoint frame
  // instead of the editor's actual `<body>` element. The published path
  // intentionally skips this scoping — the live site's `<body>` IS the page
  // body and needs no rewriting.
  const css = useMemo(() => {
    // Project up-front to `{ path, content }` so downstream code doesn't
    // re-narrow `content` on every map() call. The filter guarantees a
    // non-empty string but TS's flow analysis doesn't carry that across
    // `.sort()` and `.map()`.
    const stylesheets = files
      .flatMap<{ path: string; content: string }>((f) =>
        f.type === 'style' && typeof f.content === 'string' && f.content.length > 0
          ? [{ path: f.path, content: f.content }]
          : [],
      )
      .sort((a, b) => a.path.localeCompare(b.path))
    if (stylesheets.length === 0) return ''
    return stylesheets
      .map((f) => `/* ${escapeCommentPath(f.path)} */\n${scopeUserStylesheetForCanvas(f.content)}`)
      .join('\n\n')
  }, [files])

  useEffect(() => {
    let styleEl = document.getElementById(STYLE_TAG_ID) as HTMLStyleElement | null
    if (!styleEl) {
      styleEl = document.createElement('style')
      styleEl.id = STYLE_TAG_ID
      styleEl.setAttribute('data-source', 'UserStylesheetInjector')
      document.head.appendChild(styleEl)
    }
    styleEl.textContent = css || '/* no user stylesheets */'
  }, [css])

  useEffect(() => {
    return () => {
      document.getElementById(STYLE_TAG_ID)?.remove()
    }
  }, [])

  return null
}

/**
 * Sanitise a path for safe inclusion inside a CSS comment block. The only
 * sequence that can break out is the asterisk-slash pair — replace any
 * accidental occurrences so the comment can't terminate early. Mirrors the
 * helper of the same shape in `src/core/publisher/userStylesheets.ts`.
 */
function escapeCommentPath(path: string): string {
  return path.replace(/\*\//g, '*\\/')
}
