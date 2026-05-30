/**
 * Publisher — recursive node renderer.
 *
 * `renderNode` is the entry point for the bottom-up walk. Two paths:
 *
 *   1. Specialised renderers (looked up by moduleId) for nodes whose
 *      semantics replace the normal walk — `base.visual-component-ref`
 *      (inlines a Visual Component tree) and `base.loop` (iterates a data
 *      source and round-robins its child variants).
 *   2. Standard bottom-up flow in `renderStandardNode`: render children →
 *      resolve effective + dynamic props → escape → attach derived assets
 *      → call module.render() → collect deduped CSS → inject author classes.
 *
 * Specialised renderers receive `renderNode` as a callback so the file
 * graph stays acyclic — only this file knows both ends of the recursion.
 *
 * Constraint #211: escapeProps() is called on every node before render().
 * Constraint #179: module render() is a pure function — no DOM, no React,
 * no side effects.
 * Decision #308: CSS dedup keyed by moduleId reduces published CSS by
 * ~60–80% on typical pages.
 */

import type { PageNode } from '@core/page-tree'
import type { AnyModuleDefinition } from '@core/module-engine/types'
import { resolveProps } from '@core/page-tree/selectors'
import { resolveDynamicProps } from '@core/templates/dynamicBindings'
import { sanitizeModuleCSS } from './cssCollector'
import { escapeHtml } from './utils'
import { escapeProps } from './escapeProps'
import { injectNodeClassIds, injectNodeInlineStyles } from './classInjection'
import { renderVisualComponentRef } from './renderVisualComponentRef'
import { renderLoop } from './renderLoop'
import { resolveAutoSizes } from './sizesResolver'
import { sanitizeRichtext } from '@core/sanitize'
import type { RenderContext, RenderResolvedMedia } from './renderContext'

/**
 * Attach every resolved media asset on this node, keyed by prop key, so
 * modules with multiple media props (e.g. base.video with `videoUrl` +
 * `poster`) can read each one independently. The render() boundary preserves
 * non-string values, so `_resolvedMediaByKey` survives `escapeProps` untouched.
 *
 * Render functions read `props._resolvedMediaByKey?.<propKey>` and fall back
 * to the raw prop string when it's absent — for non-CMS URLs, pages built
 * before the prefetch ran, or the editor canvas preview that doesn't run
 * the prefetch.
 */
function attachResolvedMediaByKey(
  safeProps: Record<string, unknown>,
  def: AnyModuleDefinition,
  resolvedProps: Record<string, unknown>,
  mediaAssets: Map<string, RenderResolvedMedia> | undefined,
): void {
  if (!mediaAssets || mediaAssets.size === 0) return
  const byKey: Record<string, RenderResolvedMedia> = {}
  for (const [propKey, control] of Object.entries(def.schema)) {
    if (control.type !== 'image' && control.type !== 'media') continue
    const value = resolvedProps[propKey]
    if (typeof value !== 'string') continue
    const resolved = mediaAssets.get(value)
    if (resolved) byKey[propKey] = resolved
  }
  if (Object.keys(byKey).length > 0) {
    safeProps._resolvedMediaByKey = byKey
  }
}

/**
 * Pre-resolve `sizes='auto'` on image modules by walking the ancestor chain
 * for an explicit pixel-valued cap (typically a parent container's
 * `max-width`). The resolved string lands on `props._resolvedAutoSizes`. The
 * module's render() reads it next to its own `sizes` prop and emits the
 * result as the final `sizes` attribute. Cheap on most pages: the resolver
 * caches the parent map per Page and short-circuits as soon as it finds a
 * constraining ancestor.
 */
function attachResolvedAutoSizes(
  safeProps: Record<string, unknown>,
  def: AnyModuleDefinition,
  node: PageNode,
  resolvedProps: Record<string, unknown>,
  ctx: RenderContext,
): void {
  if (resolvedProps['sizes'] !== 'auto') return
  const hasImageProp = Object.values(def.schema).some((c) => c.type === 'image')
  if (!hasImageProp) return
  const resolvedSizes = resolveAutoSizes(node.id, ctx.page, ctx.site)
  if (resolvedSizes) {
    safeProps._resolvedAutoSizes = resolvedSizes
  }
}

/**
 * Standard bottom-up render path: children first, then resolve props, attach
 * resolved assets, call the module's pure render(), collect deduped CSS,
 * inject author classes onto the root element.
 *
 * `base.body` emits no wrapper element — its render returns naked children
 * HTML — so there's nothing to inject classes onto here. Root-level classIds
 * are applied to `<body>` by `publishPage` instead.
 */
function renderStandardNode(
  node: PageNode,
  def: AnyModuleDefinition,
  ctx: RenderContext,
): string {
  const renderedChildren = (node.children ?? []).map((childId) => renderNode(childId, ctx))

  // Resolve effective props (base + breakpoint shallow-merge for
  // breakpointOverridable schema keys only — content props always publish
  // their base value because HTML is a single document) and apply dynamic
  // template bindings.
  const effectiveProps = resolveProps(node, ctx.breakpointId, def.schema)
  const resolvedProps = resolveDynamicProps(effectiveProps, node.dynamicBindings, ctx.templateContext)

  // Escape all string props (Constraint #211) before calling render(), then
  // attach derived assets that survive the escape boundary unchanged.
  const safeProps = escapeProps(resolvedProps)
  attachResolvedMediaByKey(safeProps, def, resolvedProps, ctx.mediaAssets)
  attachResolvedAutoSizes(safeProps, def, node, resolvedProps, ctx)

  const output = def.render(safeProps as never, renderedChildren)

  // CSS dedup — one entry per moduleId. Sanitize before storage to neutralise
  // any `</style` so the HTML5 RAWTEXT tokenizer cannot escape the
  // surrounding <style> block (Constraint #228).
  if (output.css && !ctx.cssMap.has(node.moduleId)) {
    ctx.cssMap.set(node.moduleId, sanitizeModuleCSS(output.css))
  }

  // base.body has no wrapper element — its classIds + inline styles go on
  // <body> in publishPage.
  if (node.moduleId === 'base.body') return output.html
  const withClasses = injectNodeClassIds(output.html, node.classIds, ctx.site)
  return injectNodeInlineStyles(withClasses, node.inlineStyles)
}

/**
 * Emit a `<pb-hole>` placeholder for a dynamic node.
 *
 * The subtree is NOT rendered — the hole runtime fetches it at request time
 * when the element approaches the viewport. The optional `staticPlaceholder`
 * from the module definition is sanitised and baked in so non-JS visitors see
 * a meaningful fallback (skeleton, "Loading…" text, etc.).
 *
 * Sanitisation: `sanitizeRichtext` is called on the placeholder string.
 * The Bun server configures an explicit DOMPurify runtime at boot, so safe
 * semantic fallback markup is preserved while scripts, event handlers, and
 * unsafe URLs are stripped before they reach the page artefact.
 */
function renderHolePlaceholder(
  node: PageNode,
  def: AnyModuleDefinition,
  ctx: RenderContext,
): string {
  // Track which nodes actually became holes so render.ts can decide whether to
  // inject the hole runtime script based on real rendered output.
  ctx.holeNodeIds?.add(node.id)

  const rawPlaceholder = def.staticPlaceholder?.(node.props as never) ?? ''
  const sanitized = rawPlaceholder ? sanitizeRichtext(rawPlaceholder) : ''

  const safeId = escapeHtml(node.id)
  const version = ctx.publishVersion ?? 0

  return (
    `<pb-hole id="hole-${safeId}" data-pb-hole="${safeId}" data-pb-version="${version}" style="display:contents">` +
    sanitized +
    `</pb-hole>`
  )
}

/**
 * Specialised renderers keyed by moduleId. Looked up by `renderNode` before
 * the standard bottom-up walk. Each entry replaces the entire
 * "render children → resolve props → call render() → inject classes" flow
 * because the moduleId's semantics need a different shape:
 *
 * - `base.visual-component-ref`: inlines a Visual Component tree recursively,
 *   consuming its `base.slot-instance` children for slot fills.
 * - `base.loop`: iterates a `LoopEntitySource` and renders its child template
 *   once per item with a freshly pushed entry-stack frame.
 *
 * Each specialised renderer takes `renderNode` as a callback so the file
 * graph stays acyclic. Adding a new specialised render path is a single
 * Map entry plus its renderer function — no edit to renderNode's body.
 */
const SPECIAL_NODE_RENDERERS: ReadonlyMap<
  string,
  (
    node: PageNode,
    ctx: RenderContext,
    renderNode: (nodeId: string, ctx: RenderContext) => string,
  ) => string
> = new Map([
  ['base.visual-component-ref', renderVisualComponentRef],
  ['base.loop', renderLoop],
])

/**
 * Render a single node and its entire subtree recursively.
 *
 * @returns HTML string for this node and all its descendants
 */
export function renderNode(nodeId: string, ctx: RenderContext): string {
  const node = ctx.page.nodes[nodeId]
  if (!node) return ''

  const def = ctx.registry.get(node.moduleId)
  if (!def) {
    // Unknown module — emit a comment so the page doesn't silently lose content
    return `<!-- pb: unknown module "${escapeHtml(node.moduleId)}" -->`
  }

  // Layer C: when this node id is in the dynamic set, emit a <pb-hole>
  // placeholder and do NOT recurse into the subtree. The hole runtime will
  // fetch the full rendered fragment at request time via /_pb/hole/<nodeId>.
  if (ctx.dynamicNodeIds?.has(nodeId)) {
    return renderHolePlaceholder(node, def, ctx)
  }

  const specialRenderer = SPECIAL_NODE_RENDERERS.get(node.moduleId)
  if (specialRenderer) return specialRenderer(node, ctx, renderNode)

  return renderStandardNode(node, def, ctx)
}
