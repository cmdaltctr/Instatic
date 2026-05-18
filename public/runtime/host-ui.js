// fallow-ignore-file unused-file
// Loaded at runtime by plugin bundles via the import map in index.html.
// Fallow cannot see this static-asset path; the file is live in production.
/**
 * Plugin-runtime shim for `@pagebuilder/host-ui`.
 *
 * Plugins import named primitives from this package (`Button`, `Stack`,
 * `Card`, `Input`, etc.) — the host's main bundle has already populated
 * `globalThis.__pagebuilder.hostUi` with React component references that
 * use the editor's design system (and only the editor's design system).
 *
 * Adding a new export here: import it on the host side
 * (`src/admin/main.tsx` populates `__pagebuilder.hostUi`), then add the
 * named export below.
 */
const G = globalThis.__pagebuilder?.hostUi
if (!G) {
  throw new Error(
    "[@pagebuilder/runtime] Host UI not initialized. Did the host bundle finish loading before the plugin import?",
  )
}

export const Alert = G.Alert
export const Button = G.Button
export const Card = G.Card
export const Checkbox = G.Checkbox
export const Code = G.Code
export const EmptyState = G.EmptyState
export const Heading = G.Heading
export const Input = G.Input
export const SearchBar = G.SearchBar
export const Select = G.Select
export const Separator = G.Separator
export const Stack = G.Stack
export const Switch = G.Switch
export const Text = G.Text
export const Textarea = G.Textarea
