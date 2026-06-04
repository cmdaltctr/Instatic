# Agent HTML read surface — design

**Date:** 2026-06-04
**Status:** Approved design, ready for plan
**Predecessor:** [`2026-06-04-html-vs-json-snapshot-design.md`](./2026-06-04-html-vs-json-snapshot-design.md) (the benchmark that justified this)

## Problem

The site-editor agent reads the current page through a JSON read surface
(`inspect_page`, `inspect_node`, `search_nodes`, `list_classes`,
`inspect_class`) resolved server-side from a flattened `SiteSnapshot`. The
benchmark proved that representing the same page as the **publisher's annotated
HTML + `<style>` bundle** costs ~0.61× the tokens of the JSON snapshot
(306,033 vs 499,257 over 6 pages), and wins on every page — including the
styling/breakpoint layer (HTML `<style>` 42,064 vs JSON classes+tokens 54,633).

The agent already **writes** in HTML-native terms (`insertHtml`,
`replaceNodeHtml`, `getNodeHtml`). The read surface is the last JSON-shaped
part. This makes the read surface HTML-native too.

## Decisions (settled)

1. **Addressing — bare `uid` attribute.** Each rendered element carries
   `uid="<nodeId>"`, the real node id the mutation engine already speaks. The
   agent reads `uid`, then writes `{ nodeId: "<uid>" }` — the write path is
   unchanged. Rejected: line numbers (positional, decay on the first mutation,
   ambiguous for multi-line container nodes, and nothing in the write engine
   speaks them).
   - **Name:** `uid` (not `did` — verb collision with "did"; not `data-node-id`
     — 2 extra tokens × ~1400 nodes for no benefit on a never-published
     surface).
   - **Bare, no `data-` prefix.** This HTML is an agent-read artifact, never
     published, never sanitized (see "uid survives" below), so HTML5 validity
     is irrelevant and the bare form is ~1 token/node cheaper.

2. **Scope — replace the page-tree read tools.** HTML+CSS replaces the five
   tools that describe *the page tree and its styles*:
   `inspect_page`, `inspect_node`, `search_nodes`, `list_classes`,
   `inspect_class`. These are deleted.

   **Kept (catalog/reference tools — they describe things NOT present in the
   page HTML):** `list_modules` (what is insertable + prop/style schema),
   `list_tokens` (design tokens for `var(--…)` / utility classes),
   `list_pages`, `list_breakpoints`. None of these can be read off the page's
   own HTML, so they stay as JSON tools.

3. **Data flow — server renders on demand from the authoritative tree.** The
   browser POSTs the raw authoritative tree (`page` + `site`) in the chat
   request's `snapshot` field; the new server read tool renders annotated
   HTML + the `<style>` bundle on demand via the publisher. This is the same
   `publishPage` + `buildSiteCssBundle` path the **server publish renderer
   already runs in-process** (`server/publish/publicRenderer.ts`), so there is
   no new server rendering machinery.

## Why these decisions hold against the codebase

### The authoritative tree lives in the browser store

The chat handler receives `snapshot` as opaque JSON
(`server/ai/handlers/chat.ts:68`, `Type.Optional(Type.Unknown())`), built by
the browser from its live store (`buildCurrentPageContext` →
`buildPageSnapshot`). The agent's write tools are `execution: 'browser'`
because they mutate that live store; mutations may be unsaved relative to the
DB draft. **Therefore the server cannot load the tree from its own
repositories** (that would render stale, pre-edit state). The browser must
provide the tree. We post the raw `Page` + `SiteDocument` instead of the
pre-flattened snapshot, and the server derives everything from it.

This is faithful to decision #3 ("server renders") and *simplifies* the wire:
the flattened `SiteSnapshot` (with `availableModules`, `classes`, `tokens`
duplicated into bespoke shapes) is replaced by the raw tree the server already
knows how to render.

### Server-side rendering is already proven

`server/publish/publicRenderer.ts` does `import '../../src/modules/base'` to
register base modules, then calls `publishPage(page, site, …)` +
`buildSiteCssBundle(site, registry, page)` with the shared `registry`. The
new read tool calls the exact same two functions, adding
`annotateNodeIds: true`.

### `uid` survives the agent read path (no sanitizer strips it)

`publishPage` (`src/core/publisher/render.ts`) sanitizes only **CSS**
(`sanitizeModuleCSS`); it does **not** run DOMPurify over the body HTML.
DOMPurify (`src/core/sanitize.ts`) runs at richtext **write** time, not at page
render time. The benchmark already renders with the current
`data-node-id` annotation and the attribute survives intact. A bare `uid`
attribute injected by `injectNodeId` is therefore safe.

### The annotation path is isolated from the canvas

`data-node-id` appears in two unrelated places:
- **Live canvas** (`NodeRenderer.tsx`, `canvasDomGeometry.ts`,
  `renderEvidence.ts`, plugin host, DOM panel) — the editor's React DOM
  contract for selection/geometry/drag. **Untouched.**
- **Publisher annotation** (`injectNodeId` in
  `src/core/publisher/classInjection.ts`, gated by the `annotateNodeIds`
  render option) — used only by the benchmark today. **This is the only place
  the `uid` rename touches.**

## Implementation shape

### 1. Rename the publisher annotation attribute → `uid`

`src/core/publisher/classInjection.ts` — `injectNodeId`:
- Emit `uid="<id>"` instead of `data-node-id="<id>"`.
- Update the doc comment and the `renderContext.ts` / `render.ts` option docs
  that reference `data-node-id`.
- Leave `annotateNodeIds` as the option name (it still means "annotate node
  ids"), or rename to `annotateUids` for honesty — decide in the plan.

### 2. New wire payload: raw authoritative tree

Replace the site `snapshot` payload (built in
`src/admin/pages/site/agent/pageContext.ts` / `pageSnapshot.ts`) with the raw
tree:

```ts
interface SiteAgentSnapshot {
  page: Page            // the ACTIVE page, full nodes
  site: SiteDocument    // styleRules, settings, breakpoints intact;
                        // non-active pages reduced to {id,title,slug} with empty nodes
  selectedNodeId: string | null
  activeBreakpointId: string
}
```

- **Payload bound:** only the active page carries full `nodes`. Non-active
  pages keep metadata for `list_pages` but empty `nodes` maps (server-side
  rendering only ever touches the active page; `collectClassCSS`/
  `buildSiteCssBundle` use site-level `styleRules` + the active page, so other
  pages' nodes are unused → safe to drop).
- `buildPageSnapshot` (the flattening) becomes dead → **delete it** and update
  the benchmark (`scripts/bench/benches/snapshot-tokens.ts`) which is its other
  caller. The benchmark's JSON side either retires or inlines its own
  flattener; decide in the plan.

### 3. New server read tool: `read_page`

`server/ai/tools/site/readTools.ts` — replaces `inspect_page` /
`search_nodes` / `inspect_node`:

```
read_page → { html, css }
  html = publishPage(page, site, { annotateNodeIds: true }).body   // annotated <body> with uid="…"
  css  = buildSiteCssBundle(site, registry, page)                  // framework + class @media + userStyles, wrapped in <style>
```

- The server tool casts the posted `snapshot` to `SiteAgentSnapshot`, registers
  base modules (process-wide side-effect import, as the publish renderer does),
  and renders.
- One full-page read replaces the inspect/search loop. For targeted work the
  agent reads the relevant `<section uid="…">` out of the returned HTML.
- `list_classes` / `inspect_class` are gone: classes appear as `class="…"`
  attributes in `html` and as rules in the `<style>` css; write tools
  (`updateClassStyles`, `assignClass`) already accept class **name**, which is
  the selector visible in the css.

### 4. `getNodeHtml` gains `uid` annotation

`getNodeHtml` (browser-executed, used right before `replaceNodeHtml`) currently
renders an unannotated subtree via `renderNode`. Annotate it (`uid` on each
element) so read-before-replace is addressable and consistent with `read_page`.

### 5. System prompt

`server/ai/tools/site/systemPrompt.ts`:
- The dynamic suffix (root id, breakpoints, pages, selected) is now derived
  server-side from the posted `page` + `site` rather than the flattened
  snapshot fields. Same content, new source.
- Update the static prefix's "Editing existing content" guidance:
  `inspect_page` / `search_nodes` → `read_page`; describe `uid` addressing.

### 6. Cleanups (pre-release, delete don't deprecate)

- Delete `inspect_page`, `inspect_node`, `search_nodes`, `list_classes`,
  `inspect_class` and their helpers in `snapshotHelpers.ts`
  (`inspectPageNode`, `searchPageNodes`, `inspectPageClass`).
- Delete the now-unused `NodeInfo` / `ClassInfo` flattened shapes in
  `snapshot.ts` (keep what `list_modules` / `list_tokens` still need, sourced
  from `site` + registry).
- Delete `buildPageSnapshot` + `pageContext.ts`'s flattening; the browser
  adapter now serializes the raw tree.
- Update architecture tests / tool-count assertions that name the deleted
  tools.

## Open questions for the plan

1. **`list_modules` / `list_tokens` source.** With the raw tree posted, these
   server tools derive from `site.settings` + the server `registry` (same as
   `buildPageSnapshot` did via `describeFrameworkTokens` / module list). Confirm
   the server registry includes the same modules the browser shows — **plugin
   canvas modules registered only browser-side are the one parity risk.** This
   risk already exists for `list_modules` today; rendering may surface it too.
   Plan should verify and, if needed, post a minimal module/token catalog
   alongside the tree.
2. **`annotateNodeIds` → `annotateUids` rename** — cosmetic honesty; in or out?
3. **Benchmark fate** — retire `snapshot-tokens.ts`, or keep it with an inlined
   JSON flattener so the comparison stays runnable as a regression guard?
4. **`read_page` payload size for huge pages** — the biggest seeded page body
   was ~25K tokens. Acceptable as a single tool result; no pagination planned.

## Verification plan

- `bun run build`, `bun test`, `bun run lint` clean on touched files.
- Architecture tests updated for the new tool set.
- Smoke test in the admin browser (`/admin/site`, `ai@ai.com`): agent reads a
  page via `read_page`, then edits a node addressed by its `uid`, confirming the
  read→write round-trip works end to end.
