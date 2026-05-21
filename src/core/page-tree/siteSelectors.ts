/**
 * Site-document-level selectors with index-map memoisation.
 *
 * `site.pages.find(p => p.id === id)` and `site.visualComponents?.find(v =>
 * v.id === id)` are scattered throughout the editor store slices, the
 * publisher, and the editor canvas. Each call is O(n) in the number of pages
 * / VCs. Sites with hundreds of pages or VC libraries (especially during a
 * full publish that loops over every VC ref) pay that cost on every lookup.
 *
 * These selectors build an `id → entity` Map once per array reference and
 * cache it in a module-level `WeakMap` keyed on that array. Immer gives a
 * fresh array reference whenever ANY entry mutates (the new entity
 * propagates up to the array), so the cache invalidates precisely when the
 * data changes and never goes stale.
 *
 * Usage:
 *   const pagesById = selectPagesById(site)
 *   const page = pagesById.get(pageId)
 *   // or, for one-off lookups:
 *   const page = selectPageById(site, pageId)
 *
 * SSR / test-friendly: pure functions, no globals beyond the `WeakMap`
 * caches, which are GC'd automatically when the underlying arrays are.
 */
import type { Page } from './page'
import type { SiteDocument } from './siteDocument'
import type { VisualComponent } from '@core/visualComponents/schemas'

// ---------------------------------------------------------------------------
// Internal caches
// ---------------------------------------------------------------------------

const _pagesByIdCache = new WeakMap<readonly Page[], Map<string, Page>>()
const _vcsByIdCache = new WeakMap<readonly VisualComponent[], Map<string, VisualComponent>>()

function buildIndex<T extends { id: string }>(items: readonly T[]): Map<string, T> {
  const map = new Map<string, T>()
  for (const item of items) {
    map.set(item.id, item)
  }
  return map
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

/**
 * Return a `Map<pageId, Page>` for the given site. The map is memoised on
 * the `site.pages` array reference — call this freely; subsequent calls
 * with the same `pages` reference reuse the same Map instance.
 */
export function selectPagesById(site: SiteDocument): Map<string, Page> {
  const cached = _pagesByIdCache.get(site.pages)
  if (cached) return cached
  const map = buildIndex(site.pages)
  _pagesByIdCache.set(site.pages, map)
  return map
}

/**
 * Lookup a single page by id. O(1) after the first call per array reference.
 */
export function selectPageById(site: SiteDocument, pageId: string): Page | undefined {
  return selectPagesById(site).get(pageId)
}

// ---------------------------------------------------------------------------
// Visual components
// ---------------------------------------------------------------------------

const EMPTY_VC_MAP: ReadonlyMap<string, VisualComponent> = new Map()

/**
 * Return a `Map<vcId, VisualComponent>` for the given site. Memoised on the
 * `site.visualComponents` array reference. When the site has no VCs
 * (undefined array), returns a shared empty map — callers can `.get()`
 * without a null check.
 */
export function selectVisualComponentsById(
  site: SiteDocument,
): ReadonlyMap<string, VisualComponent> {
  const vcs = site.visualComponents
  if (!vcs) return EMPTY_VC_MAP
  const cached = _vcsByIdCache.get(vcs)
  if (cached) return cached
  const map = buildIndex(vcs)
  _vcsByIdCache.set(vcs, map)
  return map
}

/** Lookup a single visual component by id. O(1) after the first call. */
export function selectVisualComponentById(
  site: SiteDocument,
  componentId: string,
): VisualComponent | undefined {
  return selectVisualComponentsById(site).get(componentId)
}
