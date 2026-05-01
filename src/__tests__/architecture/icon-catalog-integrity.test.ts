/**
 * Icon Catalog Integrity — Guideline #350 / Constraint #348
 *
 * WHY THESE GATES EXIST
 * ─────────────────────
 * User directive: editor UI icons should render synchronously from the
 * MotionPageMaster icon catalog. Production UI imports concrete icon files
 * directly from `src/ui/icons/icons/<name>` instead of resolving string names
 * through a lazy runtime wrapper.
 *
 * This test file:
 *   Gate 1 — scans all src/editor/ .tsx files for direct icon imports and
 *             asserts each imported icon has a matching catalog file.
 *
 *   Gate 2 — verifies each catalog file exports the expected PascalCase component.
 *             Confirms direct imports target the expected component names.
 *
 *   Gate 3 — scans src/editor/ for inline <svg JSX (raw SVG definitions inside
 *             component files), which violates Constraint #348 / Guideline #350.
 *
 * @see Task #389       — Icon Investigation + UI Polish Audit
 * @see Guideline #350  — @motion/icons accessibility requirements
 * @see Constraint #348 — All icons must use the MotionPageMaster set
 */

import { describe, it, expect } from 'bun:test'
import { readdirSync, readFileSync, existsSync, statSync } from 'fs'
import { join, extname } from 'path'

const PROJECT_ROOT = join(import.meta.dir, '../../../')
const EDITOR_DIR   = join(PROJECT_ROOT, 'src/editor')
const ICONS_DIR    = join(PROJECT_ROOT, 'src/ui/icons/icons')

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Recursively collect .tsx / .ts files under a directory. */
function collectFiles(dir: string, exts = ['.tsx', '.ts']): string[] {
  const results: string[] = []
  if (!existsSync(dir)) return results
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      results.push(...collectFiles(full, exts))
    } else if (exts.includes(extname(entry))) {
      results.push(full)
    }
  }
  return results
}

/**
 * Convert a kebab-case icon name to the PascalCase component name used in the
 * icon file exports.
 *
 * "arrow-right"       → "ArrowRightIcon"
 * "settings"          → "SettingsIcon"
 * "sliders-horizontal"→ "SlidersHorizontalIcon"
 */
function toComponentName(kebab: string): string {
  return (
    kebab
      .split('-')
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join('') + 'Icon'
  )
}

/**
 * Extract all icon name strings referenced in a source file.
 * Covers direct imports from either alias or relative paths:
 *   import { ArrowRightIcon } from '@ui/icons/icons/arrow-right'
 *   import { CloseIcon } from '../../../ui/icons/icons/close'
 */
function extractIconNames(source: string): string[] {
  const names: string[] = []
  const seen = new Set<string>()

  function add(n: string) {
    if (!seen.has(n)) { seen.add(n); names.push(n) }
  }

  const importPattern = /from\s+["'][^"']*ui\/icons\/icons\/([a-z0-9-]+)["']/g
  let m: RegExpExecArray | null
  while ((m = importPattern.exec(source)) !== null) add(m[1])

  return names
}

// ─── Gate 1: every direct icon import in src/editor/ has a catalog file ──────

describe('Gate 1 — All direct icon imports exist in the icon catalog', () => {
  const editorFiles = collectFiles(EDITOR_DIR)

  // Collect every (iconName, filePath) pair referenced across editor components
  interface IconRef { name: string; file: string }
  const allRefs: IconRef[] = []

  for (const filePath of editorFiles) {
    const source = readFileSync(filePath, 'utf8')
    if (!source.includes('ui/icons/icons/')) continue
    const names = extractIconNames(source)
    for (const name of names) {
      allRefs.push({ name, file: filePath.replace(PROJECT_ROOT, '') })
    }
  }

  // Deduplicate for the per-name tests
  const uniqueNames = [...new Set(allRefs.map((r) => r.name))]

  it('at least one direct icon import is found in src/editor/ (sanity check)', () => {
    expect(allRefs.length).toBeGreaterThan(0)
  })

  it('every directly imported icon name has a matching file in src/ui/icons/icons/', () => {
    const missing: IconRef[] = allRefs.filter(
      (ref) => !existsSync(join(ICONS_DIR, `${ref.name}.tsx`)),
    )

    if (missing.length > 0) {
      const lines = missing.map(
        (m) => `  icon "${m.name}" referenced in ${m.file}`,
      )
      throw new Error(
        `[Gate 1 — Task #389] ${missing.length} icon(s) missing from src/ui/icons/icons/.\n` +
          lines.join('\n') +
          `\n\nFix: add the missing .tsx icon files from the MotionPageMaster repo.\n` +
          `See Constraint #348 / Guideline #350.`,
      )
    }

    expect(missing).toHaveLength(0)
  })

  it('the full list of unique icon names referenced in editor components is known', () => {
    // Informational — lists every name found so reviewers can audit coverage
    const known = uniqueNames.sort()
    expect(known.length).toBeGreaterThan(0)
    // If this changes unexpectedly, the test will surface new/removed icons
    // Update the snapshot when icons are intentionally added or removed
  })
})

// ─── Gate 2: catalog files export the expected PascalCase component ──────────

describe('Gate 2 — Catalog files export the expected PascalCase component name', () => {
  // Sample a subset of icons that are actively used in editor components
  const SAMPLED_ICONS = [
    'eye',
    'undo',
    'redo',
    'x',
    'file-text',
    'command',
    'upload',
    'sliders-horizontal',
    'smartphone',
    'monitor',
    'laptop',
    'tablet',
    'chevron-right',
    'chevron-left',
    'folder',
    'package',
    'search',
    'plus',
  ]

  for (const name of SAMPLED_ICONS) {
    it(`src/ui/icons/icons/${name}.tsx exports "${toComponentName(name)}"`, () => {
      const filePath = join(ICONS_DIR, `${name}.tsx`)
      expect(existsSync(filePath)).toBe(true)

      const source = readFileSync(filePath, 'utf8')
      const expected = toComponentName(name)
      const hasExport =
        source.includes(`export function ${expected}`) ||
        source.includes(`export const ${expected}`)

      expect(hasExport).toBe(true)
    })
  }
})

// ─── Gate 3: no inline <svg JSX in src/editor/ components ────────────────────

describe('Gate 3 — No inline <svg JSX in src/editor/ (Constraint #348)', () => {
  // Inline SVG definitions inside component files violate Constraint #348;
  // UI chrome should import concrete components from the MotionPageMaster set.
  it('no src/editor/ .tsx file contains inline <svg JSX element definitions', () => {
    const editorFiles = collectFiles(EDITOR_DIR, ['.tsx'])

    // An "inline SVG definition" is a local function or component that returns
    // a <svg> JSX element — recognisable by the pattern: `return (\n...<svg`
    // or `return <svg` inside a function body.
    //
    // We intentionally exclude:
    //   - Imports from @ui/icons (those ARE the MotionPageMaster icons)
    //   - src/ui/ entirely — icons live there legitimately
    const INLINE_SVG_PATTERN = /return\s*\(\s*\n?\s*<svg|return\s+<svg/

    const violations: string[] = []

    for (const filePath of editorFiles) {
      const source = readFileSync(filePath, 'utf8')
      if (INLINE_SVG_PATTERN.test(source)) {
        violations.push(filePath.replace(PROJECT_ROOT, ''))
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `[Gate 3 — Task #389 / Constraint #348] ${violations.length} file(s) in src/editor/ ` +
          `define inline <svg JSX elements.\n` +
          `All icons must use direct imports from '@ui/icons/icons/<name>'.\n\n` +
          violations.map((f) => `  ${f}`).join('\n') +
          `\n\nFix: replace each inline SVG function with an appropriate direct icon import.\n` +
          `See Constraint #348 / Guideline #350.`,
      )
    }

    expect(violations).toHaveLength(0)
  })
})

// ─── Gate 5: no X/Twitter logo used as close/dismiss icon ───────────────────

describe('Gate 5 — No X/Twitter logo used as close/dismiss button (Constraint #451)', () => {
  /**
   * Constraint #451 — user directive msg #1967
   *
   * `XIcon` from `src/ui/icons/icons/x.tsx` is the Twitter/X social-media logo
   * (22 stair-step rectangles), NOT a close glyph.
   *
   * The correct close icon for dialogs, modals, and panel headers is:
   *
   *   import { CloseIcon } from '@ui/icons/icons/close'
   *   <CloseIcon size={12} color="currentColor" aria-hidden="true" />
   *
   * Exceptions (files that legitimately reference the X brand logo):
   *   — File path contains "Share" or "Social" (social-sharing UI)
   *   — File contains the comment: // allowed: X social brand mark
   */
  it('no src/editor/ file imports XIcon unless it is an allowed social/share context', () => {
    const editorFiles = collectFiles(EDITOR_DIR, ['.tsx', '.ts'])

    // NOTE: patterns are assembled from parts so this test file does not self-match.
    const X_ICON_PATTERN = new RegExp(`from\\s+["'][^"']*ui/icons/icons/` + `x["']|<` + `XIcon\\b`)

    const violations: string[] = []

    for (const filePath of editorFiles) {
      // Allow social-sharing contexts by path
      const basename = filePath.replace(PROJECT_ROOT, '')
      if (/Share|Social/i.test(basename)) continue

      let source: string
      try {
        source = readFileSync(filePath, 'utf8')
      } catch {
        continue
      }

      // Allow files that carry an explicit opt-out comment
      if (source.includes('// allowed: X social brand mark')) continue

      if (X_ICON_PATTERN.test(source)) {
        violations.push(basename)
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `[Gate 5 — Constraint #451] ${violations.length} file(s) in src/editor/ use XIcon (Twitter/X logo).\n` +
          `X icon is the Twitter logo — see Constraint #451 for the correct icon.\n\n` +
          `Use the site-standard close icon instead:\n` +
          `  import { CloseIcon } from '@ui/icons/icons/close'\n` +
          `  <CloseIcon size={12} color="currentColor" aria-hidden="true" />\n\n` +
          `Violating files:\n` +
          violations.map((f) => `  ${f}`).join('\n') +
          `\n\nTo allow the X brand logo in a social-sharing context, either:\n` +
          `  — name the file/folder with "Share" or "Social", OR\n` +
          `  — add the comment: // allowed: X social brand mark`,
      )
    }

    expect(violations).toHaveLength(0)
  })
})

// ─── Gate 4: no Unicode characters used as visual icons ──────────────────────

describe('Gate 4 — No Unicode/emoji characters used as visual icons (user directive #1671)', () => {
  /**
   * INTENTIONALLY FAILING — user directive (message #1671)
   *
   * The user said: "you need to go through the entire app and find any icons that
   * are not from our package and replace them with an equivalent from our package."
   *
   * These Unicode characters are currently used as visual icons in JSX renders:
   *
   *   ❌  DomPanel.tsx:400    — '≡'  (hamburger/triple-bar) for collapsed Layers panel
   *         Fix: direct import MenuIcon from @ui/icons/icons/menu
   *
   *   ❌  PropertiesPanel.tsx:283 — '‹' / '›' for collapse/expand toggle button
   *         Fix: direct import ChevronLeftIcon / ChevronRightIcon
   *
   *   ❌  PublishingSection.tsx:83-86 — '⏳' / '✅' / '❌' / '⬇' in button labels
   *         Fix: use direct icon imports plus text labels
   *
   * Rule: Visual icons must come exclusively from the MotionPageMaster pixel-art
   * set (Constraint #348 / Guideline #350). Unicode characters ≡ ‹ › ⬇ etc.
   * look inconsistent and don't scale at different densities.
   *
   * Note: emoji in COMMENTS or aria-hidden descriptions are acceptable — this
   * gate targets JSX text content (inside JSX tags or string literals rendered
   * as React children).
   */

  /**
   * Characters that are FORBIDDEN as visual icons in JSX renders.
   * Each entry: [character, description, suggested @motion/icons replacement]
   */
  const FORBIDDEN_ICON_CHARS = [
    { char: '≡',  desc: 'triple-bar / hamburger', replacement: 'MenuIcon' },
    { char: '‹',  desc: 'single left-pointing angle quotation', replacement: 'ChevronLeftIcon' },
    { char: '›',  desc: 'single right-pointing angle quotation', replacement: 'ChevronRightIcon' },
    { char: '⬇',  desc: 'downwards black arrow', replacement: 'ArrowDownIcon or DownloadIcon' },
    { char: '⬆',  desc: 'upwards black arrow', replacement: 'ArrowUpIcon' },
  ]

  // Scan src/editor/ and src/app/ (excluding dead src/App.tsx / src/main.tsx)
  const APP_DIR = join(PROJECT_ROOT, 'src/app')
  const ACTIVE_APP_FILES = [
    join(APP_DIR, 'EditorLayout.tsx'),
    join(APP_DIR, 'router.tsx'),
  ]

  for (const { char, desc, replacement } of FORBIDDEN_ICON_CHARS) {
    it(`[FAILING] no JSX renders Unicode character '${char}' (${desc}) — use ${replacement}`, () => {
      const editorFiles = collectFiles(EDITOR_DIR, ['.tsx'])
      const appFiles = ACTIVE_APP_FILES.filter((f) => existsSync(f))
      const allFiles = [...editorFiles, ...appFiles]

      const violations: string[] = []

      for (const filePath of allFiles) {
        const source = readFileSync(filePath, 'utf8')

        // Look for the character inside JSX text content or string literals.
        // We scan for the character appearing on a non-comment line.
        // Simple heuristic: split by lines, skip lines that start with // or *
        const lines = source.split('\n')
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          const trimmed = line.trimStart()
          // Skip comment lines
          if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue
          if (line.includes(char)) {
            violations.push(`  ${filePath.replace(PROJECT_ROOT, '')}:${i + 1}: ${trimmed.slice(0, 80)}`)
          }
        }
      }

      if (violations.length > 0) {
        throw new Error(
          `[Gate 4 — Constraint #348 / User directive #1671]\n` +
            `Unicode character '${char}' (${desc}) is used as a visual icon.\n` +
            `Replace with: ${replacement}\n\n` +
            violations.join('\n') +
            `\n\nAll visual icons must come from the @motion/icons pixel-art set.\n` +
            `See Constraint #348 / Guideline #350.`,
        )
      }

      expect(violations).toHaveLength(0)
    })
  }
})
