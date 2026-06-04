# Design: HTML-vs-JSON snapshot token benchmark

**Date:** 2026-06-04
**Status:** Proposed (brainstorming output — benchmark-first)
**Scope:** A measurement harness only. It does **not** change the agent's read surface. It produces the data we need to decide *whether* to move the agent from the JSON snapshot to an annotated-HTML read surface.

---

## 1. Problem & decision being supported

The site-editor agent currently reads a page as **structured JSON**: it calls `inspect_page` and gets the full node tree, plus `inspect_page_class` / `list_tokens` for CSS and design tokens. The CMS already round-trips the *other* direction natively — the publisher renders any tree to clean HTML+CSS, and the HTML importer parses HTML back into a tree.

Open question (from the user): would the agent be better served by reading the **final HTML + CSS** (with a node id injected on each tag) instead of the parallel `nodes[] + classes[]` JSON?

That is a real architectural fork, and the first thing we need is **data**: how many tokens does each representation cost for the *same real page*? This design specifies the harness that answers that — nothing more. The read-surface change itself is a later, separate decision gated on these numbers.

**Decisions locked in brainstorming:**

- **Token counter:** Anthropic `count_tokens` REST endpoint (model-accurate, no SDK — consistent with the repo's "no provider SDKs" rule).
- **Fixtures:** real seeded pages from the dev database (true production payloads), not synthetic trees.
- **Deliverable:** benchmark first, decide later.

---

## 2. What "the snapshot as sent now" actually is (grounding)

Verified against the code, because the comparison is only fair if the JSON side is byte-accurate to what the model receives:

- **The system prompt is lean.** `buildDynamicSuffix` (`server/ai/tools/site/systemPrompt.ts`) injects only page title, root id, selected node, breakpoints, and the page list. It does **not** dump `nodes[]`/`classes[]`. So the system prompt is *not* the thing to benchmark.
- **The page payload arrives via read-tool results.** When the agent calls `inspect_page` (`server/ai/tools/site/readTools.ts`), the handler returns `{ page: { pageId, pageTitle, rootNodeId, selectedNodeId, activeBreakpointId, breakpoints, nodes } }` where `nodes` is the **entire** node tree (every id, moduleId, label, parentId, children, props, classIds, breakpointOverrides).
- **That object is serialized verbatim.** `server/ai/drivers/anthropic.ts` → `toolOutputToContent(output)` → `JSON.stringify(output.data ?? { ok: true })`, placed in a `tool_result` content block. No pretty-printing, no whitespace. CSS comes from `inspect_page_class`, tokens from `list_tokens`, each stringified the same way.

So the **JSON side** of the benchmark is exactly:

```
JSON.stringify(inspect_page payload)
+ JSON.stringify(list_classes / inspect_page_class payload)
+ JSON.stringify(list_tokens payload)
```

…for one page, matching `toolOutputToContent`.

The snapshot fields come from `buildPageContext` (`src/admin/pages/site/agent/pageContext.ts`), which maps a `Page` + `Site` into the snapshot. The only browser-only inputs are `selectedNodeId` and `activeBreakpointId` (trivial scalars). Everything else (`nodes`, `classes`, `tokens`, `breakpoints`, `pages`) is a pure function of the persisted `Page` + `SiteDocument`.

---

## 3. What "the other way around" is (the HTML side)

The same page tree rendered as **annotated HTML + its CSS**:

- **HTML:** `publishPage(page, site, registry, options)` (`src/core/publisher/render.ts`) already renders a tree to a full clean HTML document. For a faithful read-surface representation we annotate each node's outermost element with `data-node-id` so the agent can target nodes — this is the id-on-each-tag idea from the discussion.
- **CSS:** the page's stylesheet — `buildSiteCssBundle` / `collectClassCSS` + framework CSS — i.e. what the agent would need to "see" styles.

Because published HTML is intentionally id-less (clean-HTML product rule), annotation must be an **opt-in, editor-only render mode** that has zero effect on published output. See §5.

We measure the **body HTML** (not the full `<html>` document chrome — meta tags, CSP, runtime scripts are not part of a read surface) plus the CSS bundle.

---

## 4. Harness architecture

A new bench module in the existing suite (`scripts/bench/`), matching the established `BenchModule` contract (`scripts/bench/lib/types.ts`). No new top-level tooling.

```
scripts/bench/benches/snapshot-tokens.ts   ← new BenchModule
scripts/bench/lib/anthropicTokens.ts       ← new: count_tokens client (shared, testable)
scripts/bench/index.ts                      ← register in ALL_BENCHES
```

Run via the existing orchestrator: `bun run bench --only=snapshot-tokens`.

### 4.1 Data flow (per page)

```
.tmp/dev.db (SQLite, read-only)
   │  reuse server repositories (getDraftSite + listDataRows(db,'pages'))
   ▼
SiteDocument + Page[]  (real seeded pages)
   │
   ├─ JSON side:  buildPageSnapshot(page, site, registry)  ──► JSON.stringify ×3 (inspect_page + classes + tokens)
   │                                                            └─ concatenated exactly as toolOutputToContent emits
   │
   └─ HTML side:  publishPage(page, site, registry, {annotateNodeIds:true})  ──► body HTML + CSS bundle
   │
   ▼
Anthropic count_tokens  (one call per string)
   ▼
BenchResult: per-page rows {jsonTokens, htmlTokens, delta, ratio} + headline summary
```

### 4.2 Fixture loading (real seeded pages)

Reuse, do not reinvent:

- Open the dev SQLite DB **read-only** the same way `scripts/bench/benches/db.ts` opens one (`createSqliteClient`), pointed at `./.tmp/dev.db` (the `bun run dev` default).
- Load draft site settings/styleRules/breakpoints via `getDraftSite` (`server/repositories/site.ts`).
- Load pages via `listDataRows(db, 'pages')` and parse each row's stored tree — the same path `server/handlers/cms/pages.ts` uses.
- Assemble a `SiteDocument` with those pages.
- If the DB is missing/empty, fail with an actionable message ("run `bun run dev` once to seed a dev DB, or pass `--base-url`").

### 4.3 Token counting (Anthropic `count_tokens`)

- New `scripts/bench/lib/anthropicTokens.ts`: a thin client that POSTs to `https://api.anthropic.com/v1/messages/count_tokens` with `{ model, messages:[{role:'user', content }] }`, header `anthropic-version`, `x-api-key` from `ANTHROPIC_API_KEY`.
- Response body validated with a **TypeBox** schema (`{ input_tokens: number }`) via `parseJsonResponse` — no `as` at the HTTP boundary (repo rule).
- Model id is a bench constant (default `claude-sonnet-...`), overridable via `--model=`.
- **No key present:** the bench `log()`s that it's skipped and returns a `BenchResult` whose section explains how to enable it. It must not crash the suite (other benches keep running).
- Network calls are sequential with a tiny delay to respect rate limits; counts are cached per identical string within a run.

### 4.4 Avoiding snapshot drift (refactor decision)

`buildPageContext` lives in admin and is coupled to `EditorStore`. To benchmark the *real* JSON without copy-pasting its field mapping (which would silently drift from the agent's actual payload), extract the pure core:

- New pure function `buildPageSnapshot(page, site, registry, { selectedNodeId, activeBreakpointId })` in a non-admin location (e.g. `src/core/...` or alongside the agent snapshot types) that returns the `nodes/classes/tokens/breakpoints/pages` shape.
- `buildPageContext` becomes a thin adapter that reads the two scalars off the store and delegates.
- The bench calls the same pure function. → one source of truth; the benchmark can't lie.

This is a clean, in-scope refactor (repo ethos: fix at the source, no duplication). It is the one production-code change the benchmark requires beyond the opt-in render flag.

---

## 5. Annotated-HTML render mode

Add an opt-in `annotateNodeIds?: boolean` to `PublishPageOptions` / `RenderContext`, threaded into `renderNode`. When true, each node's **outermost** emitted element gets `data-node-id="<id>"`.

- **Default off.** Published output is unchanged → clean-HTML rule and all publisher snapshot/golden tests stay green.
- **Multi-root / zero-root modules:** annotate the outermost element only; if a module emits no element wrapper, the id is dropped (documented limitation, surfaced in the bench notes as "N nodes unannotatable").
- **Breakpoint:** render the active breakpoint; flag in bench notes how many nodes carry `breakpointOverrides` not visible in a single-breakpoint render (a known fidelity gap of the HTML surface, relevant to the later decision).

This flag is genuinely needed for the benchmark to measure a *real* annotated render rather than an estimate, and it is the seed the actual read-surface would build on if we proceed.

---

## 6. Output / report

The bench returns a `BenchResult` rendered by the existing report pipeline into `.tmp/benchmarks/REPORT.md`:

- **Headline:** total JSON tokens vs total HTML tokens across all real pages, and the aggregate ratio (e.g. "HTML is 0.62× the JSON cost").
- **Per-page section:** one row per page — `nodes`, `jsonTokens` (split: tree / classes / tokens), `htmlTokens` (split: body / css), `delta`, `ratio`.
- **Highlights:** biggest win/loss page; count of unannotatable nodes; count of nodes with breakpoint overrides (fidelity caveat).
- **Notes:** model used, whether counts are exact (API) — always exact here, since the decision was the API counter.

---

## 7. Testing

- `scripts/bench/lib/anthropicTokens.ts`: unit test with an injected `fetch` (test seam, like the persistence layer) — asserts request shape (endpoint, headers, body), TypeBox validation of the response, and graceful no-key behavior. No real network in tests.
- `buildPageSnapshot` extraction: a test asserting it produces the same payload `inspect_page` emits for a fixture page (locks the no-drift guarantee), plus a parity test that `buildPageContext` delegates to it.
- `annotateNodeIds`: a publisher test asserting (a) default render is byte-identical to today (no ids), and (b) with the flag, every annotatable node's outermost tag carries its `data-node-id`.
- The bench module itself is not unit-tested end-to-end (it needs a DB + network); it's exercised via `bun run bench --only=snapshot-tokens` manually.

---

## 8. Explicitly out of scope

- Changing the agent's read tools or system prompt to use HTML. (That's the *decision* this benchmark informs.)
- An HTML→tree write path / re-import on edit. (Discussed and rejected earlier: the tree is strictly richer than HTML — slot instances, VC refs, rich module props, per-breakpoint overrides don't survive a round-trip. Surgical mutations stay.)
- Token-counting any provider other than Anthropic.

---

## 9. Risks / open points

- **count_tokens cost/latency:** one API call per string per page. Mitigated by per-run caching and sequential pacing; the bench is run on demand, not in CI.
- **Fidelity caveats are real signal, not noise:** unannotatable nodes and dropped breakpoint overrides are *findings* the report must surface — they're central to the eventual read-surface decision, not harness bugs.
- **Refactor blast radius:** extracting `buildPageSnapshot` touches `buildPageContext` and its tests. Small and contained, but it is production code, not just a script.

---

## 10. Implementation checklist (when approved)

1. Extract pure `buildPageSnapshot(page, site, registry, opts)`; make `buildPageContext` delegate. Add drift/parity tests.
2. Add `annotateNodeIds` opt-in to the publisher; add the two publisher tests.
3. Add `scripts/bench/lib/anthropicTokens.ts` + its unit test.
4. Add `scripts/bench/benches/snapshot-tokens.ts`; register in `ALL_BENCHES`.
5. Run `bun run bench --only=snapshot-tokens` against a seeded `.tmp/dev.db`; capture the report.
6. `bun run build` + `bun test` + `bun run lint`; docs note in `docs/features/agent.md` pointing at the bench.
