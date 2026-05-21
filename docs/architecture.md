# Architecture

System-level overview of Page Builder CMS — what runs, what depends on what, and where to look first.

Page Builder is a self-hosted CMS with a built-in visual page builder. One Bun process serves the public website, the admin editor, the CMS API, published pages, and uploaded media, backed by either Postgres or SQLite. The visual editor's output is plain semantic HTML and hand-clean CSS — no framework runtime is injected into published pages.

---

## TL;DR

- **One process**: `bun server/index.ts`. `Bun.serve` + a hand-written router (`server/router.ts`) routes every request to a CMS handler, a published page, an upload, or the SPA entrypoint.
- **One database, two engines**: Postgres (via `Bun.sql`) or SQLite (`bun:sqlite`), selected by `DATABASE_URL`. Repositories are dialect-naive; migrations are split per dialect with identical IDs.
- **One content model**: posts, pages, and visual components all live in `data_tables` + `data_rows`. No separate `pages` table. Page trees and VC trees both use the `NodeTree<TNode>` primitive.
- **Two frontends, one bundle**: the admin app (`src/admin/`) shells the visual editor (`src/admin/pages/site/`). Both run in the same Vite-built SPA, mounted under `/admin/*`.
- **Plugins run sandboxed**: server entrypoints and canvas module packs execute inside a QuickJS-WASM VM with no host access. They reach the CMS through the SDK at `src/core/plugin-sdk/`.
- **Publishing is static**: the editor mutates a page tree in memory; on publish, `src/core/publisher/` renders that tree to static HTML/CSS and the server serves it from disk.
- **Every untyped boundary uses TypeBox.** HTTP responses, request bodies, persisted JSON, plugin manifests, settings. `zod` is banned outside `server/handlers/agent/tools.ts`.

---

## Process and layout

```text
┌──────────────────────── Bun process ────────────────────────┐
│                                                             │
│   server/index.ts          ← entrypoint, boots router       │
│      ↓                                                      │
│   server/router.ts         ← routes every URL               │
│      ↓                                                      │
│   ┌──────────────┬──────────────┬──────────────┐            │
│   │ CMS handlers │ Static SPA   │ Published    │            │
│   │ /admin/api/  │ /admin/*     │ pages, files │            │
│   │              │  → dist/     │  → uploads/  │            │
│   │ → repos      │              │              │            │
│   │ → db client  │              │              │            │
│   └──────────────┴──────────────┴──────────────┘            │
│      ↓                                                      │
│   server/db/client.ts      ← Postgres OR SQLite             │
│                                                             │
│   server/plugins/          ← QuickJS-WASM sandbox host      │
│      └─ runs plugin server entrypoints + module packs       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

The same process serves visitors, admins, the API, plugin runtimes, and uploads. There is no separate worker, no message queue, no managed service surface. Scaling out means running another container backed by Postgres.

---

## Folders, at a glance

```text
server/         Bun server: router, handlers, repositories, plugin runtime, DB
src/admin/      Admin app shell (auth, navigation, workspaces, plugin host UI)
src/admin/pages/site/   Visual page builder (canvas, panels, toolbar, store)
src/core/       Engine: page tree, publisher, plugin SDK + runtime, persistence
src/modules/    First-party block modules (container, text, image, button, …)
src/ui/         Shared UI primitives (Button, Input, Tree, icons, cn helper)
src/styles/     Global tokens (globals.css)
src/__tests__/architecture/   Gate tests that enforce structural rules
docs/           This documentation tree
examples/       Plugin templates, type declarations
vendor/         Vendored pixel-art-icons package
scripts/        Build, dev, icon sync, benchmark scripts
```

---

## Layer responsibilities

The repo is organized by responsibility, not by feature. Every file has one reason to exist.

| Layer                        | Lives in                              | Owns                                                                 |
|------------------------------|---------------------------------------|----------------------------------------------------------------------|
| HTTP & routing               | `server/router.ts`, `server/http.ts`  | Request dispatch, body parsing, error envelopes                      |
| CMS endpoints                | `server/handlers/cms/*.ts`            | Per-resource handlers (pages, posts, components, media, plugins, …)  |
| Auth & sessions              | `server/auth/*`                       | Session validation, capability checks, login flow                    |
| Repositories                 | `server/repositories/*.ts`            | Database access; dialect-naive ANSI SQL only                         |
| Database adapters            | `server/db/postgres.ts`, `sqlite.ts`  | Engine-specific `DbClient` implementation                            |
| Migrations                   | `server/db/migrations-*.ts`           | Schema in both dialects, parity-gated                                |
| Publisher                    | `src/core/publisher/*`                | Page tree → static HTML/CSS                                          |
| Plugin SDK                   | `src/core/plugin-sdk/*`               | Author-facing API + `pb-plugin` CLI                                  |
| Plugin runtime (host)        | `src/core/plugins/*`                  | In-process plugin lifecycle: install/activate/uninstall              |
| Plugin sandbox (worker)      | `server/plugins/*`                    | QuickJS-WASM execution of plugin server code + module packs          |
| Page tree primitive          | `src/core/page-tree/*`                | `NodeTree<TNode>` + tree-agnostic mutations                          |
| Visual components            | `src/core/visualComponents/*`         | VC tree shape, slot synchronization, recursion checks                |
| Persistence (client-side)    | `src/core/persistence/*`              | HTTP envelopes, response schemas, site validation                    |
| Validation utilities         | `src/core/utils/*`                    | TypeBox helpers, JSON boundary helpers, sanitization                 |
| Admin shell                  | `src/admin/*` (excluding `pages/site/`)| Auth, routing, workspaces, plugin host UI, modals                   |
| Visual editor                | `src/admin/pages/site/*`              | Canvas, panels, toolbar, editor store                                |
| First-party modules          | `src/modules/*`                       | Built-in block modules (container, text, image, …)                   |
| UI primitives                | `src/ui/components/*`                 | Button, Input, Switch, Tree, etc. — shared across admin + editor     |
| Design tokens                | `src/styles/globals.css`              | All CSS custom properties                                            |
| Architecture gates           | `src/__tests__/architecture/*.test.ts`| Structural rules executed as part of `bun test`                      |

---

## Request lifecycle

```text
HTTP request
    │
    ▼
server/index.ts          ← Bun.serve fetch handler
    │
    ▼
server/router.ts         ← match path
    │
    ├─→ /admin/api/cms/*    → server/handlers/cms/<resource>.ts
    │       │
    │       ├─→ server/auth         (session + capability checks)
    │       ├─→ server/repositories (DB access)
    │       └─→ server/db/client    (Postgres or SQLite)
    │
    ├─→ /admin/api/cms/plugins/<id>/runtime/* → plugin worker (QuickJS)
    │
    ├─→ /admin/*            → static SPA (dist/index.html)
    │
    ├─→ /uploads/*          → server/static.ts (file disk)
    │
    └─→ /*  (everything else) → published page (uploads/published/...)
                                  or 404
```

Handlers validate request bodies with TypeBox before doing work, talk to repositories for persistence, and return `{ error: string }` envelopes on failure. Validation helpers live in `server/http.ts`. Per-handler logging uses the prefix `console.error('[<module>]', err)`.

---

## Data model

Everything content-shaped lives in two tables.

### `data_tables` (system table)

A user-defined collection — a "post type" in WordPress terms. Has a `kind`:

| `kind`       | Used for                                      |
|--------------|-----------------------------------------------|
| `postType`   | Blog posts, products, anything list-like      |
| `page`       | Stand-alone pages with URLs                   |
| `component`  | Visual components (reusable subtrees)         |

The three system tables (`posts`, `pages`, `components`) are seeded by the baseline migration and are locked from rename/delete.

### `data_rows`

Rows in a `data_tables` collection. Stored cells are typed — a row in the `pages` table has a `body` cell of type `pageTree`; a row in `components` has a `tree` cell of type `pageTree` plus a `params` cell of type `fieldSchema`.

The shape and cell types are defined by the `data_tables` schema. There is no separate `pages` table, no `page_versions` table, no per-feature row layout. Adding a new "post type" means inserting a `data_tables` row with the right `cells` schema.

### Storage conventions

- JSON columns end in `_json`. The SQLite adapter auto-parses any `*_json` string on read and auto-stringifies any plain object on write. Gated by `db-json-column-naming.test.ts`.
- Migrations are split per dialect with identical IDs. PG uses `jsonb`, `timestamptz`, `bigint`, `distinct on`; SQLite uses `text`, `text`, `integer`, window-function rewrites. Parity gated by `migration-parity.test.ts`.
- Repositories use only ANSI-standard SQL. The five Postgres-isms — `now()` in DML, `::int`, `::jsonb`, `any($N::...)`, `distinct on` — are banned in any `DbClient`-importing file. Gated by `db-postgres-isms.test.ts`.

See [docs/reference/database-dialects.md](reference/database-dialects.md) for the full rules.

---

## The page tree primitive

Every tree-of-nodes in the CMS — page trees, Visual Component trees, slot fills — has one shape:

```ts
type NodeTree<TNode> = {
  nodes: Record<string, TNode>
  rootNodeId: string
}
```

Defined in `src/core/page-tree/treeSchema.ts` (single source of truth). Mutations operate on any `NodeTree` generically via `src/core/page-tree/mutations.ts`.

Routing to the active tree (page vs. VC mode) is the **sole** job of `mutateActiveTree(fn)` in `src/admin/pages/site/store/siteSlice.ts`. The 11 named tree-mutation store actions (`insertNode`, `deleteNode`, `updateNodeProps`, `setBreakpointOverride`, `clearBreakpointOverride`, `renameNode`, `toggleNodeLocked`, `toggleNodeHidden`, `moveNode`, `duplicateNode`, `wrapNode`) are one-liners that call `mutateActiveTree`. They must not contain their own `kind === 'visualComponent'` routing branch — gated by `no-vc-mode-branches-in-mutations.test.ts`.

See [docs/reference/page-tree.md](reference/page-tree.md) for the type shape and mutation cookbook.

---

## Publishing pipeline

```text
Editor state (Zustand store)
    │
    │  user clicks Publish
    ▼
src/core/publisher/                   ← renderer
    │
    │  walks the page tree, resolves modules, expands VCs and slots,
    │  emits clean HTML + a single CSS bundle per page
    ▼
uploads/published/<route>.html        ← written to disk
    │
    ▼
server/static.ts                      ← serves on next request
```

Key properties:

- **Pure render, no client-side hydration of layout.** Published pages are HTML and CSS. Plugins can inject frontend assets (`server/publish/frontendInjections.ts`), but the page structure is static.
- **Sanitization happens at the publisher boundary.** DOMPurify in `src/core/sanitize.ts` cleans rich-text and HTML strings before they hit disk.
- **Visual components are inlined.** Each VC instance is expanded with its slot fills materialized as locked child nodes in the consumer page tree. The publisher pairs each `base.slot-instance` with the matching `base.slot-outlet` by `slotName`.

---

## Plugin system

Plugins are zip packages containing a `plugin.json` manifest and bundled entrypoints. The host runs plugin code in a **QuickJS-WASM sandbox**:

- `entrypoints.server` runs in `server/plugins/quickjsHost.ts`
- `entrypoints.modules` (canvas module packs) run in `server/plugins/modulePackVm.ts`
- Author-facing API lives in `src/core/plugin-sdk/`
- Host-side runtime (install, activate, deactivate, uninstall) lives in `src/core/plugins/`

The sandbox has no Node, no Bun, no file system, no environment variables, and no network unless the plugin declares `network.outbound` permission and a `networkAllowedHosts` allowlist. The `pb-plugin build` CLI emits IIFE bundles and scans for forbidden literals (`'node:'`, `'bun:'`, `require(`, `process.binding`); the install handler scans again as defense-in-depth.

Sandbox invariants are gated by `src/__tests__/architecture/plugin-sandbox-invariants.test.ts`.

See [docs/features/plugin-system.md](features/plugin-system.md) for the full feature doc.

---

## Frontend architecture

### Two apps, one bundle

The browser bundle is a single Vite-built React 19 SPA, mounted at `/admin`. Inside it:

- `src/admin/` — the **admin shell**: routing, sessions, top-level navigation, the workspaces for content / media / plugins / users / dashboard, and the plugin host UI.
- `src/admin/pages/site/` — the **visual editor**: the canvas, panels, toolbar, picker, property controls, and the editor store (Zustand + Immer). This is the page builder itself.

The split exists because the editor is a self-contained app with its own state and lifecycle, but it shares the admin's auth, routing, and theming.

### Routing

In-house router at `src/admin/lib/router.tsx` and `src/admin/lib/routerHooks.ts`. Replaces `react-router-dom` for the 4-route admin app. **Admin-only** — banned in `src/admin/pages/site/`, `src/core/`, and `src/modules/`, gated by `no-router-in-site-page.test.ts`.

### State

- Admin shell: small contexts in `src/admin/state/` and `src/admin/sessionContext.ts`.
- Editor: Zustand store at `src/admin/pages/site/store/`, mutating page tree state via Immer. The store routes mutations to the active tree (page or VC) through `mutateActiveTree(fn)`.

### Styling

- CSS Modules only in `src/admin/` and `src/admin/pages/site/`. No Tailwind utility classes — gated by `noTailwindUtilities.test.ts`.
- All colors and radii come from CSS custom properties in `src/styles/globals.css`. No hardcoded hex / rgb / hsl. See [docs/design.md](design.md).
- Class composition uses the in-house `cn` helper at `src/ui/cn.ts`. No `clsx`, `tailwind-merge`, `class-variance-authority`, or `@radix-ui/*`. Gated by `no-tailwind-deps.test.ts`.

See [docs/editor.md](editor.md) for the visual editor deep-dive.

---

## Validation at every boundary

The codebase enforces "validate, then trust": every untyped input goes through a [TypeBox](https://github.com/sinclairzx81/typebox) schema. Inside the boundary, code trusts the parsed value.

| Boundary                             | Helper                                                | Lives in                              |
|--------------------------------------|-------------------------------------------------------|---------------------------------------|
| HTTP response (client)               | `parseJsonResponse(res, Schema)`                      | `src/core/utils/jsonValidate.ts`      |
| Persistence layer envelope (client)  | `readEnvelope(res, Schema, fallbackMessage)`          | `src/core/persistence/httpJson.ts`    |
| `JSON.parse` of persisted strings    | `safeParseJson(raw, Schema)` / `parseJsonWithFallback`| `src/core/utils/jsonValidate.ts`      |
| Request body (server)                | TypeBox schema in handler                             | `server/http.ts` helpers              |
| Plugin manifest                      | `parsePluginManifest`                                 | `src/core/plugins/manifest.ts`        |
| Site document on load                | `validateSite`                                        | `src/core/persistence/validate.ts`    |

Domain types come from `Static<typeof Schema>`. There is no parallel `interface Foo` next to `FooSchema`. **Schemas are the source of truth.**

`zod` is banned from app and core code. The only legitimate `zod` usage is `server/handlers/agent/tools.ts`, because `@anthropic-ai/claude-agent-sdk`'s `tool()` API has a type-level `AnyZodRawShape` constraint TypeBox can't satisfy. Gated by `no-anthropic-sdk.test.ts` and import scans.

See [docs/reference/typebox-patterns.md](reference/typebox-patterns.md) for the cookbook.

---

## Where things live — decision table

When making a change, this table answers "where does it go?"

| You're adding…                                         | Put it in                                                  |
|--------------------------------------------------------|------------------------------------------------------------|
| A new HTTP endpoint                                    | `server/handlers/cms/<resource>.ts` + route in `router.ts` |
| A new database table                                   | Both `server/db/migrations-pg.ts` and `migrations-sqlite.ts` (same ID) |
| A new repository function                              | `server/repositories/<resource>.ts`                        |
| A new editor mutation                                  | `src/core/page-tree/mutations.ts` (tree-agnostic, takes `NodeTree`) |
| A new editor store action                              | `src/admin/pages/site/store/siteSlice.ts` (one-liner calling `mutateActiveTree`) |
| A new first-party module (block)                       | `src/modules/<module-name>/`                               |
| A new UI primitive                                     | `src/ui/components/<Component>/`                           |
| A new plugin SDK surface                               | `src/core/plugin-sdk/` + update `examples/plugins/template`|
| A new design token                                     | `src/styles/globals.css`                                   |
| A new icon                                             | Import from `pixel-art-icons/icons/<name>`, then `bun run icons:sync` |
| A new admin route                                      | `src/admin/pages/<route>/` + register in `src/admin/router.tsx` |
| A new structural rule                                  | `src/__tests__/architecture/<rule>.test.ts`                |

---

## Invariants enforced by tests

Architectural rules live as tests in `src/__tests__/architecture/*.test.ts` and run as part of `bun test`. Changing a structural rule means updating the matching test. The most load-bearing gates:

| Rule                                                                                                  | Gate                                                            |
|-------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------|
| Migrations parity between PG and SQLite                                                               | `migration-parity.test.ts`                                      |
| JSON columns end in `_json`                                                                           | `db-json-column-naming.test.ts`                                 |
| No Postgres-isms in repositories                                                                      | `db-postgres-isms.test.ts`                                      |
| Page tree uses `NodeTree<PageNode>` only                                                              | `task455-tree-primitive.test.ts`                                |
| Store mutations don't branch on VC mode                                                               | `no-vc-mode-branches-in-mutations.test.ts`                      |
| No Tailwind utility classes (covers all palette names: `bg-zinc-*`, `text-blue-*`, etc.)              | `noTailwindUtilities.test.ts`, `no-tailwind-deps.test.ts`       |
| Every color in admin / ui CSS modules comes from a token (no hardcoded hex / rgb / hsl)               | `css-token-policy.test.ts`                                      |
| No `react-router-dom` in the editor                                                                   | `no-router-in-site-page.test.ts`                                |
| All buttons go through the `Button` primitive                                                         | `button-primitive-usage.test.ts`                                |
| Icons come from `pixel-art-icons`                                                                     | `no-third-party-icons.test.ts`, `direct-icon-imports.test.ts`   |
| Vendored icon set is fresh                                                                            | `vendor-icons-fresh.test.ts`                                    |
| Plugin sandbox invariants (no `node:`, `bun:`, `require`, etc.)                                       | `plugin-sandbox-invariants.test.ts`                             |
| No `@anthropic-ai/sdk` (must use `@anthropic-ai/claude-agent-sdk`)                                    | `no-anthropic-sdk.test.ts`                                      |
| UI primitives live in `src/ui/components/`                                                            | `ui-primitives-location.test.ts`                                |

See [docs/reference/architecture-tests.md](reference/architecture-tests.md) for the complete catalog (80+ gates).

---

## Build, run, test

```sh
# install
bun install

# develop
bun run dev              # SQLite at .tmp/dev.db, no Docker
DATABASE_URL=postgres://… bun run dev   # Postgres mode

# verify
bun run build            # tsc -b && vite build (typecheck + bundle)
bun test                 # unit + architecture tests
bun run lint             # eslint with cache
```

`bun run build` runs both `tsc -b` and `vite build` — a change that runs in dev but fails `tsc` is not done. Verification is an end-of-task gate, not a per-edit ritual; see `CLAUDE.md` for the rules around pre-existing failures from parallel sessions.

---

## Related

- `CLAUDE.md` — the agent rule book (start there before changing code)
- [docs/CONVENTIONS.md](CONVENTIONS.md) — how docs in this repo are structured
- [docs/design.md](design.md) — visual design system
- [docs/server.md](server.md) — server-side deep dive
- [docs/editor.md](editor.md) — admin + canvas editor deep dive
- [docs/features/plugin-system.md](features/plugin-system.md) — the plugin system
- [docs/reference/page-tree.md](reference/page-tree.md) — the tree primitive
- [docs/reference/database-dialects.md](reference/database-dialects.md) — PG vs. SQLite rules
- Source-of-truth files:
  - `server/router.ts` — request dispatch
  - `server/db/client.ts` — database abstraction
  - `src/core/page-tree/treeSchema.ts` — `NodeTree` primitive
  - `src/admin/pages/site/store/siteSlice.ts` — `mutateActiveTree`
  - `src/core/publisher/` — publishing pipeline
  - `src/styles/globals.css` — design tokens
- Gate tests: `src/__tests__/architecture/*.test.ts`
