/**
 * BTN-3 — Button Primitive Usage Gate (Task #462)
 *
 * Every interactive button in src/app/ and src/editor/ MUST use the shared Button primitive
 * (src/ui/components/Button/Button.tsx).  Raw <button JSX elements are
 * banned except in the §8 allowlist below.
 *
 * ALLOWLIST contains the ONLY files permitted to contain bare <button — either
 * because they ARE the Button primitive or because they carry a legitimate §8
 * design-system exception documented in Contribution #667.
 *
 * §8 exceptions:
 *   §8.1 Settings nav buttons — full-width left-sidebar navigation (SettingsModal)
 *   §8.2 Full-width disclosure toggles — Section, DepsSection,
 *         PropertyControlRenderer
 *   §8.3 Pill micro-remove buttons — ClassPicker (< 20×20px fixed,
 *         Button's 26px min-height would distort pill layout)
 *   §8.4 Toggle switch hit areas — ToggleControl, PreferencesSection
 *         (role="switch", custom 44×44 WCAG 2.5.5 hit area not achievable via
 *         Button's fixed size tokens)
 *
 * @see Contribution #667 — Button Design System Phase 2 spec (parent: this task)
 * @see Task #462 — Button Design System Phase 2 (37-file migration)
 */

import { describe, it, expect } from 'bun:test'
import { readdirSync, readFileSync, statSync, existsSync } from 'fs'
import { join, extname, relative } from 'path'

const SRC_ROOT = join(import.meta.dir, '../..')
const APP_ROOT = join(SRC_ROOT, 'app')
const EDITOR_ROOT = join(SRC_ROOT, 'editor')
const SCAN_ROOTS = [
  { label: 'app', root: APP_ROOT },
  { label: 'editor', root: EDITOR_ROOT },
]

// ---------------------------------------------------------------------------
// TSX file walker
// ---------------------------------------------------------------------------

function collectTSXFiles(dir: string): string[] {
  const results: string[] = []
  if (!existsSync(dir)) return results
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      results.push(...collectTSXFiles(full))
    } else if (extname(entry) === '.tsx') {
      results.push(full)
    }
  }
  return results
}

// ---------------------------------------------------------------------------
// §8 allowlist — files permitted to contain bare <button elements
// Paths are relative to src/ for readability.
// ---------------------------------------------------------------------------

/**
 * Each entry is a path relative to src/ that is permitted to contain
 * one or more bare <button elements.  ALL entries must have a §8 justification
 * comment here; new entries without justification will fail code review.
 */
const ALLOWLIST = new Set([
  // ── §8.1 Settings nav buttons ────────────────────────────────────────────
  // Full-width left-sidebar navigation links styled as nav items.
  // Using Button would break the nav-item layout (full-width, icon+text, active state).
  'editor/components/Settings/SettingsModal.tsx',

  // ── §8.2 Full-width disclosure toggles ──────────────────────────────────
  // These are collapsible section headers that span the full panel width.
  // Button's inline-flex sizing and padding do not fit a full-width disclosure pattern.
  'editor/components/PropertiesPanel/Section.tsx',
  'editor/components/DependenciesPanel/DepsSection.tsx',
  'editor/components/PropertyControls/PropertyControlRenderer.tsx',

  // ── §8.4 Toggle switch hit areas ────────────────────────────────────────
  // role="switch" toggle controls need a 44×44 WCAG 2.5.5 transparent hit area
  // wrapped around the visual pill.  This is a custom <button layout that does
  // not fit Button's token-driven size system.
  'editor/components/PropertyControls/ToggleControl.tsx',
  'editor/components/Settings/sections/PreferencesSection.tsx',
])

// ---------------------------------------------------------------------------
// BTN-3 gate
// ---------------------------------------------------------------------------

describe('BTN-3 — Button primitive usage gate', () => {
  it('all <button elements in src/app and src/editor are either the Button primitive or an §8 exception', () => {
    const files = SCAN_ROOTS.flatMap(({ root }) => collectTSXFiles(root))
    const violations: string[] = []

    for (const file of files) {
      const rel = relative(SRC_ROOT, file)

      // Skip allowlisted files
      if (ALLOWLIST.has(rel)) continue

      const source = readFileSync(file, 'utf-8')

      // Match bare <button followed by a space or > (i.e. not <Button which is the primitive).
      // The capital-B <Button is the primitive; lowercase <button is forbidden outside the allowlist.
      if (/<button[\s>/]/.test(source)) {
        violations.push(rel)
      }
    }

    if (violations.length > 0) {
      const list = violations.map((v) => `  - ${v}`).join('\n')
      console.error(`BTN-3 FAIL: bare <button found outside allowlist:\n${list}`)
    }

    expect(violations).toEqual([])
  })

  it('Button primitive owns the shared 44px touch-target size', () => {
    const source = readFileSync(join(SRC_ROOT, 'ui/components/Button/Button.tsx'), 'utf-8')
    const css = readFileSync(join(SRC_ROOT, 'ui/components/Button/Button.module.css'), 'utf-8')

    expect(source).toMatch(/["']lg["']/)
    expect(css).toMatch(/\.size-lg\s*\{[\s\S]*height:\s*44px/)
    expect(css).toMatch(/\.size-lg\.iconOnly\s*\{[\s\S]*width:\s*44px/)
  })
})
