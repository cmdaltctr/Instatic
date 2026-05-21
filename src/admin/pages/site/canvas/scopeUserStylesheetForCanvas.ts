/**
 * scopeUserStylesheetForCanvas — rewrite user-authored CSS so the canvas
 * preview behaves like the published page.
 *
 * Two impedance mismatches between the published HTML and the editor canvas
 * make raw user CSS render differently across the two surfaces:
 *
 *  1. `<body>` is the page body on the live site, but in the canvas there's
 *     only one `<body>` (the editor chrome) and each breakpoint frame renders
 *     the page body as a `<div data-pb-page-body>` inside its own viewport.
 *     Selectors like `body { background: black; }` would paint the editor
 *     chrome instead of the page frame.
 *
 *  2. Every node in the canvas is wrapped in a `<div class="nodeWrapper">`
 *     for selection / drag-drop / accessibility plumbing. The wrapper is
 *     `display: contents` so layout is transparent, but CSS combinators
 *     follow the DOM tree, not the layout tree — so `body > nav > strong`
 *     never matches in the canvas because there's a NodeWrapper between
 *     every authored element pair.
 *
 * This helper transforms user CSS so both mismatches dissolve, but ONLY for
 * the canvas-injected copy. The publisher emits the original CSS so visitors
 * still get the strict cascade the author wrote.
 *
 * Transformations applied:
 *  A. `body` (whole-token element selector) → `[data-pb-page-body]`. The
 *     `BodyEditor` component carries that attribute, so the substituted
 *     selector matches the same DOM element that `<body>` matches on the
 *     published page.
 *
 *  B. The `>` direct-child combinator is relaxed to a descendant combinator
 *     (single space) inside selectors. This is a deliberate semantic
 *     loosening — `body > nav > strong` on the published site means "direct
 *     children only", but in the canvas the NodeWrappers would break the
 *     direct-child relationship. The descendant combinator approximates the
 *     intent for the overwhelmingly common authoring pattern (page-body →
 *     section → heading) without changing the published-site cascade.
 *     Authors who specifically need strict direct-child matching can use
 *     class-level styling instead; that path doesn't go through this scoper.
 *
 * What this DOESN'T do (deliberately):
 *  - It does not parse CSS into an AST — a hand-written tokenizer is enough
 *    for one substitution and a combinator swap and avoids pulling in a
 *    parser dependency.
 *  - It does not touch `html` / `:root` selectors. Those usually carry
 *    custom-property declarations (`:root { --color-bg: ... }`) and apply
 *    to the editor's <html> too, which is harmless and lets variables
 *    inherit into the canvas.
 *  - It does not handle attribute selectors / strings that contain the
 *    literal `body` or `>` — those are skipped because the tokenizer tracks
 *    `[…]`, `"…"`, `'…'`, and CSS comments.
 */

const SELECTOR_BOUNDARY_BEFORE = /[\s,>~+(){}]/
const SELECTOR_BOUNDARY_AFTER = /[\s,>~+(){}[.:#]/

export function scopeUserStylesheetForCanvas(rawCss: string): string {
  if (!rawCss) return ''

  let out = ''
  let i = 0
  const len = rawCss.length
  // Block depth: 0 at the top, 1+ inside `{` blocks. Bare `body` is rewritten
  // only when we're outside of a declaration block (i.e. selector position),
  // which means we need to know how many open braces have NOT yet been closed
  // by a matching `}`. Selectors can sit at depth 0 (top-level rule) or
  // inside an at-rule wrapper like `@media (...)` (depth 1). Rather than
  // tracking nested at-rule depth precisely, we rewrite at any depth — the
  // worst-case false positive is rewriting a `body` keyword inside something
  // like `@keyframes body { ... }`, which is impossible because keyframe
  // names with the literal token `body` aren't a thing in user CSS.
  let inSingleString = false
  let inDoubleString = false
  let inBracket = false
  let inComment = false
  let inAtRule = false
  // We rewrite `body` only when in selector position, never inside a
  // declaration value (e.g. `font-family: body-font` if someone named a font
  // that way). Declarations live between `{` and the next `;` or `}`. Track
  // "are we in a declaration list?" by remembering the last unmatched `{`.
  // Simpler: when we hit `{`, declarations follow until the matching `}`.
  // We only rewrite when at depth-zero selector position.
  let depth = 0

  while (i < len) {
    const c = rawCss[i]
    const c2 = rawCss[i + 1]

    // ── String / comment / bracket handling — never rewrite inside these ──
    if (inComment) {
      out += c
      if (c === '*' && c2 === '/') { out += '/'; i += 2; inComment = false; continue }
      i++
      continue
    }
    if (inSingleString) {
      out += c
      if (c === "'" && rawCss[i - 1] !== '\\') inSingleString = false
      i++
      continue
    }
    if (inDoubleString) {
      out += c
      if (c === '"' && rawCss[i - 1] !== '\\') inDoubleString = false
      i++
      continue
    }
    if (inBracket) {
      out += c
      if (c === ']') inBracket = false
      i++
      continue
    }
    if (c === '/' && c2 === '*') { inComment = true; out += '/*'; i += 2; continue }
    if (c === "'") { inSingleString = true; out += c; i++; continue }
    if (c === '"') { inDoubleString = true; out += c; i++; continue }
    if (c === '[') { inBracket = true; out += c; i++; continue }

    // ── Block / at-rule depth tracking ──
    if (c === '{') {
      depth++
      out += c
      i++
      continue
    }
    if (c === '}') {
      depth = Math.max(0, depth - 1)
      out += c
      i++
      continue
    }
    if (c === ';' && inAtRule && depth === 0) {
      // End of an at-rule without a body (e.g. `@import url(...);`).
      inAtRule = false
      out += c
      i++
      continue
    }
    if (depth === 0 && c === '@') {
      inAtRule = true
    }

    // ── At declarations inside a rule, don't rewrite — match property tokens ──
    // Heuristic: inside a rule (depth >= 1) the format is `prop: value;`. We
    // only want to rewrite `body` inside an at-rule's nested selector. Since
    // distinguishing "selector position inside @media" from "declaration
    // position inside a normal rule" without a real parser is fiddly, we
    // restrict rewriting to depth 0 (top-level selectors), which covers the
    // overwhelmingly common case. Users who scope rules inside @media using
    // `body` will see slightly different cascade in the canvas vs the live
    // site — acceptable, and improvable later.
    if (depth !== 0) {
      out += c
      i++
      continue
    }

    // ── At depth 0 selector position: rewrite `body` element selector ──
    if ((c === 'b' || c === 'B') && matchesBody(rawCss, i)) {
      const prevChar = out.length === 0 ? '' : out[out.length - 1]
      const nextChar = rawCss[i + 4] ?? ''
      const validBefore = prevChar === '' || SELECTOR_BOUNDARY_BEFORE.test(prevChar)
      const validAfter = nextChar === '' || SELECTOR_BOUNDARY_AFTER.test(nextChar)
      if (validBefore && validAfter) {
        out += '[data-pb-page-body]'
        i += 4
        continue
      }
    }

    // ── At depth 0 selector position: relax `>` combinator to descendant ──
    // The NodeWrapper div between every authored element in the canvas would
    // otherwise prevent any `>`-using selector from matching. We swap `>` for
    // a single space, which matches the same elements minus the strict-child
    // constraint. See the file header for the rationale.
    if (c === '>') {
      // Make sure we leave a separating space so adjacent tokens don't fuse.
      const prevChar = out.length === 0 ? '' : out[out.length - 1]
      if (prevChar !== ' ' && prevChar !== '\n' && prevChar !== '\t') out += ' '
      // Skip any whitespace following the `>` so we emit a single separator.
      i++
      while (i < len && (rawCss[i] === ' ' || rawCss[i] === '\t')) i++
      continue
    }

    out += c
    i++
  }

  return out
}

function matchesBody(src: string, i: number): boolean {
  // Case-insensitive match for the literal `body`.
  const a = src.charCodeAt(i)
  const b = src.charCodeAt(i + 1)
  const c = src.charCodeAt(i + 2)
  const d = src.charCodeAt(i + 3)
  return (
    (a === 0x62 || a === 0x42) &&
    (b === 0x6f || b === 0x4f) &&
    (c === 0x64 || c === 0x44) &&
    (d === 0x79 || d === 0x59)
  )
}
