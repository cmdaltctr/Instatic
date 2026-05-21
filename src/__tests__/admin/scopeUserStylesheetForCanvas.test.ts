/**
 * scopeUserStylesheetForCanvas — rewrites bare `body` element selectors so
 * user CSS authored for the published page's `<body>` lands on the editor
 * canvas's `[data-pb-page-body]` wrapper instead of the editor chrome.
 *
 * These tests pin the substitution boundaries so a future regex tweak can't
 * silently start rewriting things it shouldn't (attribute strings, comments,
 * declaration values, custom property names that contain "body", etc.).
 */

import { describe, it, expect } from 'bun:test'
import { scopeUserStylesheetForCanvas } from '../../admin/pages/site/canvas/scopeUserStylesheetForCanvas'

describe('scopeUserStylesheetForCanvas', () => {
  it('rewrites a bare body selector at the start of a rule', () => {
    const out = scopeUserStylesheetForCanvas('body { background: black; }')
    expect(out).toBe('[data-pb-page-body] { background: black; }')
  })

  it('rewrites body inside compound selectors AND relaxes > to descendant', () => {
    const out = scopeUserStylesheetForCanvas('body > nav { padding: 1rem; }')
    expect(out).toBe('[data-pb-page-body] nav { padding: 1rem; }')
  })

  it('rewrites body followed by pseudo-class', () => {
    const out = scopeUserStylesheetForCanvas('body:hover { color: red; }')
    expect(out).toBe('[data-pb-page-body]:hover { color: red; }')
  })

  it('rewrites body followed by class chain (with > relaxed)', () => {
    const out = scopeUserStylesheetForCanvas('body.dark > main { color: white; }')
    expect(out).toBe('[data-pb-page-body].dark main { color: white; }')
  })

  it('rewrites body when listed alongside other selectors', () => {
    const out = scopeUserStylesheetForCanvas('html, body, main { margin: 0; }')
    expect(out).toBe('html, [data-pb-page-body], main { margin: 0; }')
  })

  it('leaves declaration values that contain the word body alone', () => {
    // `body-color` is a hypothetical custom property — the substring `body`
    // appears but it's a declaration value, not a selector.
    const out = scopeUserStylesheetForCanvas('.x { --body-color: red; font: body-font; }')
    expect(out).toBe('.x { --body-color: red; font: body-font; }')
  })

  it('does not rewrite body inside CSS comments', () => {
    const out = scopeUserStylesheetForCanvas('/* body styles */ body { color: red; }')
    expect(out).toBe('/* body styles */ [data-pb-page-body] { color: red; }')
  })

  it('does not rewrite body that is a substring of another identifier', () => {
    // `bodycopy` is a single identifier — must NOT become
    // `[data-pb-page-body]copy`.
    const out = scopeUserStylesheetForCanvas('.bodycopy { font-size: 1rem; }')
    expect(out).toBe('.bodycopy { font-size: 1rem; }')
  })

  it('does not rewrite body inside attribute selector strings', () => {
    const out = scopeUserStylesheetForCanvas('[data-tag="body"] { color: red; }')
    expect(out).toBe('[data-tag="body"] { color: red; }')
  })

  it('does not rewrite body inside string literals', () => {
    const out = scopeUserStylesheetForCanvas('.x::before { content: "body"; }')
    expect(out).toBe('.x::before { content: "body"; }')
  })

  it('rewrites body case-insensitively', () => {
    const out = scopeUserStylesheetForCanvas('BODY { margin: 0; }')
    expect(out).toBe('[data-pb-page-body] { margin: 0; }')
  })

  it('handles multiple rules across many lines (with > relaxed everywhere)', () => {
    const input = `:root { --x: 1; }
body { background: black; }
body > nav { padding: 1rem; }
.card { border: 1px solid; }`
    const out = scopeUserStylesheetForCanvas(input)
    expect(out).toBe(`:root { --x: 1; }
[data-pb-page-body] { background: black; }
[data-pb-page-body] nav { padding: 1rem; }
.card { border: 1px solid; }`)
  })

  it('relaxes nested > combinators throughout a selector', () => {
    // Every authored element in the canvas is wrapped in a NodeWrapper div,
    // so all `>` combinators have to relax to descendant — not just the
    // first one after body.
    const out = scopeUserStylesheetForCanvas('body > section > h1 + p { margin-top: 1rem; }')
    expect(out).toBe('[data-pb-page-body] section h1 + p { margin-top: 1rem; }')
  })

  it('does not relax > inside attribute selectors', () => {
    // `>` inside `[…]` would be a typo in CSS but we still must not touch it.
    const out = scopeUserStylesheetForCanvas('[data-foo=">bar"] { color: red; }')
    expect(out).toBe('[data-foo=">bar"] { color: red; }')
  })

  it('does not relax > inside strings', () => {
    const out = scopeUserStylesheetForCanvas('.x::before { content: ">"; }')
    expect(out).toBe('.x::before { content: ">"; }')
  })

  it('preserves CSS unchanged when no body selectors are present', () => {
    const input = '.foo { color: red; } .bar { padding: 1rem; }'
    expect(scopeUserStylesheetForCanvas(input)).toBe(input)
  })

  it('returns empty string for empty input', () => {
    expect(scopeUserStylesheetForCanvas('')).toBe('')
  })

  it('preserves CSS custom properties inside `:root`', () => {
    // :root is intentionally NOT rewritten — it carries variables that need
    // to inherit into the editor canvas the same way they do on the live site.
    const input = ':root { --color-bg: #0f0f10; }'
    expect(scopeUserStylesheetForCanvas(input)).toBe(input)
  })
})
