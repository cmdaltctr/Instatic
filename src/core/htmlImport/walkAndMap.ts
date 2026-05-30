/**
 * Walk a parsed (and already stripped) DOM Document and map each element to
 * a first-class PageNode via the HTML_TO_MODULE_RULES table.
 *
 * Rules:
 *   - When a recursing container is walked, both its ELEMENT children and its
 *     significant TEXT children are mapped, in document order. Element children
 *     route through the rule table; a text child becomes a synthesized
 *     `base.text` (tag `span`) so direct text — e.g. `<div class="num">98%</div>`
 *     or `<li>Buy milk</li>` — is preserved instead of producing an empty
 *     container. Whitespace-only text (indentation between tags) and comments
 *     are ignored. Leaf rules (text/link/button/image) capture `textContent`
 *     directly and never recurse.
 *   - The first matching rule in HTML_TO_MODULE_RULES is used (guaranteed
 *     to always match because the catch-all '*' rule is last).
 *   - Node creation uses the canonical factory so every produced node is a
 *     valid PageNode: createNode(moduleId, { ...def.defaults, ...ruleProps }).
 *   - class names from el.classList are preserved verbatim on node.classIds.
 *     This layer is registry-agnostic: it writes *names*, not ids, and does
 *     no inline-style promotion. The store action `insertImportedNodes`
 *     reconciles those names into real registry class ids (creating bare
 *     classes for unknown names) as the fragment enters the live tree.
 *
 * Consumers:
 *   - Paste-HTML modal (browser-side)
 *   - AI agent insertHtml tool (browser-side agent executor)
 *
 * Both consumers call importHtml(source) — the single public entry point.
 */

import type { PageNode } from '@core/page-tree'
import { createNode } from '@core/page-tree'
import { registry } from '@core/module-engine/registry'
import { HTML_TO_MODULE_RULES } from './rules'
import type { ImportRule } from './rules'
import { parseHtml } from './parseHtml'
import { stripUnsafe } from './stripUnsafe'
import type { StripReport } from './stripUnsafe'
import { harvestInlineBackgrounds } from './inlineStyle'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A flat NodeTree fragment of real PageNodes. Children are ID strings, matching
 * the rest of the engine's NodeTree<PageNode> shape.
 */
export interface ImportFragment {
  /** All produced nodes keyed by id. */
  nodes: Record<string, PageNode>
  /** IDs of the document-order top-level nodes (doc.body element children). */
  rootIds: string[]
}

/** The result returned by the convenience entry point importHtml(). */
export interface ImportResult extends ImportFragment {
  /** Counts of constructs stripped by stripUnsafe(). */
  stripped: StripReport
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// DOM nodeType constants. Spelled numerically so this module needs no `Node`
// global (it runs in the browser bundle and under the happy-dom test polyfill).
const ELEMENT_NODE = 1
const TEXT_NODE = 3

/**
 * Mutable accumulator threaded through the recursive walk.
 *
 * - `nodes` is written as elements are mapped.
 * - `backgrounds` is the read-only harvest of inline background styles keyed by
 *   the source element (see `harvestInlineBackgrounds`), looked up per element
 *   and written onto the produced node's `inlineStyles`.
 */
interface WalkContext {
  nodes: Record<string, PageNode>
  backgrounds: Map<Element, Record<string, string>>
}

/**
 * Find the first rule whose selector matches `el`. Always returns a rule
 * because the last rule in the table uses the catch-all '*' selector.
 */
function matchRule(el: Element): ImportRule {
  for (const rule of HTML_TO_MODULE_RULES) {
    if (el.matches(rule.match)) return rule
  }
  // Unreachable: the catch-all '*' rule always matches every element.
  return HTML_TO_MODULE_RULES[HTML_TO_MODULE_RULES.length - 1]!
}

/**
 * Collapse internal whitespace runs to single spaces and trim the ends. A
 * text node that is only whitespace (indentation/newlines between tags)
 * collapses to '' and is skipped by the caller — it carries no content.
 */
function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim()
}

/**
 * Build a synthesized `base.text` node for a bare text node's content. Direct
 * text inside a recursing container has no element of its own, so it would
 * otherwise be dropped — leaving an empty container. `span` keeps it inline so
 * it flows naturally inside its parent (and within mixed content alongside
 * sibling elements). Returns the new node's id after registering it in `nodes`.
 */
function createTextNode(text: string, ctx: WalkContext): string {
  const def = registry.getOrThrow('base.text')
  const node = createNode('base.text', { ...def.defaults, text, tag: 'span' })
  ctx.nodes[node.id] = node
  return node.id
}

/**
 * Map the child nodes of `parent` (an element being recursed into, or
 * `doc.body` at the top level) to PageNode ids in document order:
 *   - ELEMENT children route through the rule table via processElement.
 *   - significant TEXT children become synthesized base.text(span) nodes.
 *   - whitespace-only text and comments are skipped.
 *
 * Mutually recursive with processElement (function declarations are hoisted,
 * so definition order doesn't matter).
 */
function mapChildNodes(parent: Element, ctx: WalkContext): string[] {
  const childIds: string[] = []
  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType === ELEMENT_NODE) {
      childIds.push(processElement(child as Element, ctx))
    } else if (child.nodeType === TEXT_NODE) {
      const text = normalizeText(child.textContent ?? '')
      if (text) childIds.push(createTextNode(text, ctx))
    }
  }
  return childIds
}

/**
 * Map a single DOM element to a PageNode, recursing into its children if the
 * matched rule has `recurse: true`. Adds the produced node (and all
 * descendants) to `nodes` keyed by id.
 *
 * Returns the id of the node produced for `el`.
 */
function processElement(el: Element, ctx: WalkContext): string {
  const rule = matchRule(el)
  const { moduleId, props: ruleProps } = rule.map(el)

  // Merge module defaults with rule-specific props so every node starts
  // from a well-formed baseline.
  const def = registry.getOrThrow(moduleId)
  const node = createNode(moduleId, { ...def.defaults, ...ruleProps })

  // Preserve element class *names* verbatim. This layer is registry-agnostic
  // (it has no SiteDocument), so it cannot mint real class ids here. The store
  // action `insertImportedNodes` links these names to registry class ids (and
  // auto-creates bare classes for unknown names) when the fragment is inserted.
  node.classIds = Array.from(el.classList)

  // Attach the element's inline background image (harvested before stripUnsafe
  // removed the `style` attribute) as the node's inline styles — the editor's
  // first-class per-node `style=""` layer.
  const bg = ctx.backgrounds.get(el)
  if (bg) node.inlineStyles = bg

  if (rule.recurse) {
    // Walk childNodes (not just children) so direct text is preserved in
    // document order. Without this, `<div class="num">98%</div>` and
    // `<li>Buy milk</li>` import as empty containers because their text
    // content isn't an element.
    node.children = mapChildNodes(el, ctx)
  }

  ctx.nodes[node.id] = node
  return node.id
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/**
 * Walk doc.body's child nodes and map each to a PageNode via
 * HTML_TO_MODULE_RULES. Returns a flat fragment (nodes map + root IDs) that
 * callers splice into the live page tree. Top-level bare text is preserved as
 * a root base.text node, mirroring nested handling.
 *
 * Expects that `doc` has already been through `stripUnsafe()` — call
 * `importHtml()` to run both steps together.
 */
export function walkAndMap(
  doc: Document,
  backgrounds: Map<Element, Record<string, string>> = new Map(),
): ImportFragment {
  const ctx: WalkContext = { nodes: {}, backgrounds }

  if (!doc.body) return { nodes: ctx.nodes, rootIds: [] }

  const rootIds = mapChildNodes(doc.body, ctx)

  return { nodes: ctx.nodes, rootIds }
}

/**
 * The single entry point for both consumers: parse → strip → walk.
 *
 * 1. parseHtml  — DOMParser.parseFromString (global, browser or test polyfill)
 * 2. harvestInlineBackgrounds — capture each element's inline background image
 *    BEFORE step 3 removes the `style` attribute
 * 3. stripUnsafe — removes <script>, <style>, inline event handlers, style=""
 * 4. walkAndMap  — maps every element to a PageNode via HTML_TO_MODULE_RULES,
 *    attaching the harvested background to its node's `inlineStyles`
 *
 * Returns an ImportResult that merges the fragment with the StripReport so
 * callers can surface a "Stripped: N scripts, M handlers" toast.
 */
export function importHtml(source: string): ImportResult {
  const doc = parseHtml(source)
  // Harvest inline background images before stripUnsafe drops `style` attrs.
  const backgrounds = harvestInlineBackgrounds(doc)
  const stripped = stripUnsafe(doc)
  const fragment = walkAndMap(doc, backgrounds)
  return { ...fragment, stripped }
}
