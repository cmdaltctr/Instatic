# Plan: patch-based editor undo/redo history (on Mutative)

Status: proposed (not yet implemented). Supersedes the full-site-snapshot model in
`src/admin/pages/site/store/slices/site/`, and migrates the editor state layer from
Immer to **Mutative** first.

## Library decision: Mutative

The dominant win (full-site clone → patches) is delivered by Immer or Mutative
equally. Mutative is chosen because, **specifically for the patches path**, it is
~1.9× faster than Immer with auto-freeze on, and — unlike Immer — stays fast with
auto-freeze **off** (Immer + patches + no-freeze ≈ 5.73 ops/sec, a collapse). That
headroom matters most for the broad mutations (HTML import, framework reconcile) and
large sites. General store updates via `zustand-mutative` are ~10× faster than
`zustand/middleware/immer`.

We do **not** adopt `zustand-travel`/`travels` (the ready-made Mutative undo/redo
middleware): it tracks the whole store with no selective-state support, and our undo
must exclude UI state (zoom/pan/selection — gated by an existing test). We use
Mutative's **core** `create({ enablePatches: true })` + `apply()` with our own
`site`-scoped wiring.

Footprint: Immer is used in ~7 non-test files (one `middleware/immer`, rest
`import type { Draft }`) + 6 test files (`produce`). Recipe bodies are unchanged —
Mutative uses the identical mutate-the-draft style. State is plain JSON-ish data
(no class instances), so no `markSimpleObject` marking is needed.

API mapping:
- `zustand/middleware/immer` → `zustand-mutative` (`mutative` middleware)
- `produce(base, recipe)` → `create(base, recipe)`
- `produceWithPatches(base, recipe)` → `create(base, recipe, { enablePatches: true })` → `[next, patches, inverse]`
- `applyPatches(base, patches)` → `apply(base, patches)`
- `import type { Draft } from 'immer'` → `import type { Draft } from 'mutative'`
- Auto-freeze: Immer defaults on; Mutative defaults off. Keep **on in dev/test**
  (`{ enableAutoFreeze: true }`) for the accidental-mutation guard + parity, **off in
  prod** for speed.

## Why

Today every committed mutation runs `structuredClone(site)` (`snapshotCurrentSite()`
in `helpers.ts`) and the undo stack stores up to 50 whole-`SiteDocument` clones.
Benchmark (synthetic sites built with the real `createNode` factory) of the clone
that runs **per mutation** plus the real RSS of a 50-deep history:

| Site | Nodes | Clone/mutation (sync, main thread) | 50-deep history RSS |
|------|-------|------|------|
| 20 pg × 250 | 5,000 | 8.8 ms | ~142 MB |
| 50 pg × 400 | 20,000 | 34 ms | ~436 MB |
| 100 pg × 500 | 50,000 | 98 ms | ~759 MB |
| 150 pg × 800 | 120,000 | 251 ms | ~1.6 GB |

The 16 ms frame budget is blown by the clone alone at ~5–8k nodes (a realistic
20–40 page site), and it is paid on **every** action (insert, move, delete, colour
pick, toggle) — not just typing. Memory grows to crash territory. The
keystroke-coalescing change already landed reduces snapshot *frequency*; this plan
removes the *per-snapshot cost* and shrinks each entry from MBs to KB.

## Target design

Use Immer's `produceWithPatches` to capture **inverse patches** as a by-product of
the mutation the store already performs. Undo = `applyPatches(site, entry.inverse)`;
redo = `applyPatches(site, entry.forward)`. Only touched paths are drafted/copied,
so cost is O(change), not O(site).

### Data model (`types.ts`)

Replace the two `SiteDocument[]` stacks with patch-pair entries:

```ts
import type { Patches } from 'mutative'   // Patch[] is `Patches`

export interface HistoryEntry {
  /** Patches that revert this transaction (applied on undo). */
  inverse: Patches
  /** Patches that re-apply this transaction (applied on redo). */
  forward: Patches
  /** Coalescing identity, or null. Same role as the current _historyCoalesceKey. */
  coalesceKey: string | null
}

_historyPast: HistoryEntry[]
_historyFuture: HistoryEntry[]
_historyCoalesceKey: string | null   // kept
```

All patches are rooted at `state.site` (the single undoable document — it already
embeds `packageJson` and `runtime`). `packageJson` / `siteRuntime` top-level mirrors
and `activePageId` validity are **derived** after apply, exactly as the current
undo/redo already recompute them.

### Capture (helpers.ts)

Rewrite each `mutate*` helper to capture patches with Mutative's `create`:

```ts
import { create } from 'mutative'

function mutateSite(fn, opts) {
  const cur = get().site
  if (!cur) return false
  let result: SiteMutationResult
  const [next, forward, inverse] = create(cur, (draft) => {
    result = fn(draft as SiteDocument)        // recipe returns void here…
  }, { enablePatches: true })
  // …the recipe must NOT return a value (that would replace site); capture
  // the no-op signal in `result` instead (use rawReturn() only if a real
  // replacement is ever needed).
  if (result === false || forward.length === 0) return false
  set((state) => {
    state.site = next
    commitHistory(state, { inverse, forward, coalesceKey: opts?.coalesceKey ?? null })
    state.hasUnsavedChanges = true
    // updatedAt already set by recipe or here
  })
  return true
}
```

`mutateActiveTree` / `mutateActiveTreeAndSite` read `activeDocument` / `activePageId`
from `get()` first, then route to the page/VC tree **inside** the `create` recipe so
slot reconciliation (`reconcileVCRefsForVc`) is captured in the same patch set.
`mutateSiteState` keeps its editor-state writes in the outer `set` (those fields are
not undoable today and stay that way — parity preserved). `mutateAllPagesAndSite`
uses the same wrapper; its patch set is larger but still ≤ a full clone.

`snapshotCurrentSite()` and the `structuredClone(site)` in `pushHistory()` are deleted.

### Commit + coalescing (helpers.ts)

```ts
function commitHistory(state, entry: HistoryEntry) {
  const coalescing =
    entry.coalesceKey !== null &&
    entry.coalesceKey === state._historyCoalesceKey &&
    state._historyPast.length > 0
  if (coalescing) {
    const top = state._historyPast[state._historyPast.length - 1]
    // Fold: one undo must revert the whole burst back to its pre-burst state.
    top.inverse = [...entry.inverse, ...top.inverse]   // newest-undo first
    top.forward = [...top.forward, ...entry.forward]    // oldest-redo first
    state._historyFuture = []
    state.canRedo = false
    return
  }
  state._historyPast.push(entry)
  if (state._historyPast.length > MAX_HISTORY) state._historyPast.shift()
  state._historyFuture = []
  state._historyCoalesceKey = entry.coalesceKey
  state.canUndo = true
  state.canRedo = false
}
```

Patch arrays for a text burst are tiny (1 patch/keystroke on one path), so the
concatenation stays negligible.

### Apply (undoRedoActions.ts)

```ts
import { apply } from 'mutative'

undo() {
  const cur = get().site
  const entry = lastOf(_historyPast)
  if (!cur || !entry) return
  const restored = apply(cur, entry.inverse)
  const packageJson = clonePackageJson(restored.packageJson)
  const runtime = cloneSiteRuntimeConfig(restored.runtime)
  set((state) => {
    state.site = { ...restored, packageJson, runtime }
    state.packageJson = packageJson
    state.siteRuntime = runtime
    state._historyPast.pop()
    state._historyFuture.push(entry)
    state._historyCoalesceKey = null
    state.canUndo = state._historyPast.length > 0
    state.canRedo = true
    state.hasUnsavedChanges = true
    if (!state.site.pages.find((p) => p.id === state.activePageId)) {
      state.activePageId = state.site.pages[0]?.id ?? null
    }
  })
}
```

`redo()` is symmetric (`entry.forward`, push entry back onto `_historyPast`). This is
the existing undo/redo body with the stored-snapshot swap replaced by `applyPatches`.

## Result (implemented)

Per-mutation wall time is now **flat at ~0.25–0.4 ms regardless of site size**
(measured driving real `updateNodeProps` through the store), versus the old
full-site `structuredClone`:

| Nodes | Patch-based | structuredClone | Speedup |
|-------|-------------|-----------------|---------|
| 500 | 0.25 ms | 0.76 ms | 3× |
| 5,000 | 0.28 ms | 8.8 ms | 31× |
| 20,000 | 0.32 ms | 34 ms | 106× |
| 50,000 | 0.40 ms | 98 ms | ~245× |

A full 50-deep history holds ~240 small patches (KB) instead of 50 whole-site
clones (hundreds of MB). O(change), not O(site).

## Phases

0. **[DONE] Migrate Immer → Mutative (behavior-preserving).** Add `mutative` +
   `zustand-mutative`; swap the `immer` middleware in `store.ts` (and
   `contentAgentStore.ts`) for `mutative` with `{ enableAutoFreeze: true }` in
   dev/test; swap `import type { Draft } from 'immer'` → `'mutative'` (6 files);
   swap `produce` → `create` in the 6 page-tree/component tests; remove the `immer`
   dependency; update `CLAUDE.md` stack line + any deps gate. No history changes yet
   — full suite must stay green. This isolates the library swap from the rewrite.
1. **Data model.** Add `HistoryEntry`, change stack types in `types.ts` /
   `siteSlice.ts` initial state. Mutative patches are enabled per-call via
   `create(..., { enablePatches: true })`, so no global enable needed.
   Lifecycle resets already clear the stacks — keep.
2. **Capture.** Rewrite the six `mutate*` helpers to `produceWithPatches`; delete
   `snapshotCurrentSite` + `structuredClone` paths. Port `pushHistory()` (external
   batch entry) to capture-and-commit (it brackets manual multi-mutation batches —
   confirm its few callers still get one undo step).
3. **Commit + coalescing.** Implement `commitHistory` with patch-concat folding.
4. **Apply.** Rewrite `undo` / `redo` with `applyPatches` + derived re-mirroring.
5. **Test migration.** `undo-redo.test.ts` asserts `_historyPast.length` deltas and
   node counts — compatible. Audit any test that inspects entry *shape* (most only
   reset stacks to `[]` in `beforeEach`, which is fine). Add tests: deep-undo
   correctness on a multi-node tree, coalesced burst → single undo, redo after
   coalesced burst, VC-mode tree edits, `mutateAllPagesAndSite` one-step revert.
6. **Validate perf.** Re-run the benchmark harness adapted to drive real mutations:
   assert per-mutation time is flat (O(change)) across site sizes and history RSS is
   bounded by patch size, not site size.

## Correctness risks & handling

- **Recipe `return false` vs producer replace semantics** — never return the recipe
  result from the `produceWithPatches` callback; capture it in a closure var and gate
  on `result !== false && forward.length > 0`.
- **No-op mutations** — empty `forward` ⇒ no entry, no `updatedAt`/`hasUnsavedChanges`
  bump (parity with today's `recipeDidMutate`).
- **Editor-only state in `mutateSiteState`** — not undoable today; keep it out of the
  patch set so behaviour is unchanged.
- **`packageJson` / `siteRuntime` mirror identity** — re-derive (clone) from the
  restored site so `state.site.packageJson === state.packageJson` invariant holds.
- **Slot reconcile / explorer reconcile** must run *inside* the producer so their
  writes are in the patch set; they only mutate bounded regions, so patch sets stay
  small.
- **autofreeze** — Mutative defaults auto-freeze off. Enable it in dev/test
  (`{ enableAutoFreeze: true }`) to keep the accidental-external-mutation guard and
  match current Immer behaviour; leave it off in prod for speed. `apply()` and
  `create()` tolerate frozen bases, so assigning a produced `next` back in is fine.
- **`rawReturn` / recipe replacement** — never return a value from the `create`
  recipe (Mutative treats a returned value as a replacement, same trap as Immer).
  Capture the no-op signal in a closure var; use `rawReturn()` only for a deliberate
  whole-site replacement (not needed by any current recipe).

## Out of scope / unchanged

- Keystroke coalescing keys (`props:`, `bp:`, `vcparam:`) — reused as-is.
- `previewFrameworkChange` clone — not history, untouched.
- Persistence — history is in-memory session state, never serialised.
