// fallow-ignore-file unused-file
// Loaded at runtime by plugin bundles via the import map in index.html.
// Fallow cannot see this static-asset path; the file is live in production.
/**
 * Plugin-runtime shim for `@pagebuilder/host-hooks`.
 *
 * Plugins import editor + plugin-runtime hooks from this package:
 *   useEditorStore, usePluginSettings, usePluginContext,
 *   usePluginRoutes, useEditorCommand
 *
 * The host's main bundle populates `globalThis.__pagebuilder.hostHooks`
 * with the live hook implementations and the React context they
 * subscribe to.
 */
const G = globalThis.__pagebuilder?.hostHooks
if (!G) {
  throw new Error(
    "[@pagebuilder/runtime] Host hooks not initialized. Did the host bundle finish loading before the plugin import?",
  )
}

export const PluginContext = G.PluginContext
export const useEditorStore = G.useEditorStore
export const usePluginSettings = G.usePluginSettings
export const usePluginContext = G.usePluginContext
export const usePluginRoutes = G.usePluginRoutes
export const useEditorCommand = G.useEditorCommand
export const useCanvasNodeRect = G.useCanvasNodeRect
export const useCanvasViewport = G.useCanvasViewport
