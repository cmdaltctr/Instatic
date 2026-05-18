// fallow-ignore-file unused-file
// Loaded at runtime by plugin bundles via the import map in index.html.
// Fallow cannot see this static-asset path; the file is live in production.
/**
 * Plugin-runtime shim for `react/jsx-dev-runtime`.
 *
 * Bun.build emits `import { jsxDEV } from 'react/jsx-dev-runtime'` in
 * dev / non-production bundles. The browser resolves that bare specifier
 * through the host's import map to this file, which re-exports the host's
 * own JSX dev runtime — so plugins share the host's React instance even
 * for development-mode JSX.
 */
const G = globalThis.__pagebuilder?.ReactJsxDevRuntime
if (!G) {
  throw new Error(
    "[@pagebuilder/runtime] Host React JSX dev runtime not initialized. Did the host bundle finish loading before the plugin import?",
  )
}

export const jsxDEV = G.jsxDEV
export const Fragment = G.Fragment
