/**
 * Site-editor page-context adapter.
 *
 * Reads the two editor-only scalars (`selectedNodeId`, `activeBreakpointId`)
 * off the live store and delegates to the pure `buildPageSnapshot`, which owns
 * the full `Page` + `Site` → snapshot mapping. This is the only *site-specific*
 * piece of the agent layer — wired in via `agentSliceConfig.site.ts`.
 *
 * Keeping the mapping in `buildPageSnapshot` (and only the store read here)
 * means the token benchmark exercises the exact same builder the agent does.
 */

import { registry } from '@core/module-engine'
import type { Page } from '@core/page-tree'
import type { EditorStore } from '@site/store/types'
import { buildPageSnapshot } from './pageSnapshot'
import type { PageContext, PageContextTokens } from './types'

const EMPTY_TOKENS: PageContextTokens = { colors: [], typography: [], spacing: [], fonts: [] }

export function buildPageContext(
  state: EditorStore,
  activePage: Page | undefined,
): PageContext {
  if (!activePage || !state.site) {
    return {
      pageId: '',
      pageTitle: 'Untitled',
      rootNodeId: '',
      pages: [],
      activeBreakpointId: state.activeBreakpointId,
      breakpoints: [],
      nodes: [],
      availableModules: [],
      selectedNodeId: null,
      classes: [],
      tokens: EMPTY_TOKENS,
    }
  }

  return buildPageSnapshot(activePage, state.site, registry, {
    selectedNodeId: state.selectedNodeId,
    activeBreakpointId: state.activeBreakpointId,
  })
}

/**
 * Convenience wrapper around `buildPageContext` — looks up the active
 * page on the store and forwards it. Exported so the site editor's
 * agent-slice config can drop it straight into `buildSnapshot`.
 */
export function buildCurrentPageContext(get: () => EditorStore): PageContext {
  const storeState = get()
  const activePage = storeState.site?.pages.find(
    (p) => p.id === storeState.activePageId,
  ) ?? storeState.site?.pages[0]
  return buildPageContext(storeState, activePage)
}
