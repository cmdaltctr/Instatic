import '../../src/modules/base'
import '@core/loops/sources'
import { registry } from '@core/module-engine/registry'
import { publishPage } from '@core/publisher/render'
import { buildRouteFrame } from '@core/templates/contextFrames'
import { buildSiteCssBundle } from './siteCssBundle'
import { selectEntryTemplate } from '@core/templates/templateMatching'
import { prefetchLoopData, publishedDataRowToLoopItem } from './loopPrefetch'
import { prefetchMediaAssets } from './mediaPrefetch'
import type { PublishedDataRow } from '@core/data/schemas'
import type { DbClient } from '../db/client'
import type { PublishedPageSnapshot } from '../repositories/publish'
import { hookBus } from '@core/plugins/hookBus'
import { collectFrontendInjections, injectFrontendAssets } from './frontendInjections'

/**
 * URL prefix where the Bun server exposes the per-site CSS bundle. Mirrors
 * `/_pb/assets/` for runtime scripts. The matching route is registered in
 * `server/router.ts` and serves files with `Cache-Control: immutable`.
 */
const CSS_ASSET_BASE_URL = '/_pb/css/'

/** URL prefix for the loop data endpoint serving infinite-load fragments. */
const LOOP_ENDPOINT_BASE_URL = '/_pb/loop/'

export interface RenderPublishedSnapshotContext {
  db: DbClient
  /** Optional request URL — when present, drives per-loop pagination. */
  url?: URL
}

export async function renderPublishedSnapshot(
  snapshot: PublishedPageSnapshot,
  ctx: RenderPublishedSnapshotContext,
): Promise<string> {
  const page = snapshot.site.pages.find((candidate) => candidate.id === snapshot.pageRowId)
  if (!page) throw new Error(`Published page "${snapshot.pageRowId}" not found in snapshot`)
  await hookBus.emit('publish.before', { siteId: snapshot.site.id, pageId: snapshot.pageRowId })
  const cssBundle = buildSiteCssBundle(snapshot.site, registry)
  // Pre-fetches run in parallel — none depends on the others and each hits
  // the DB independently. `collectFrontendInjections` is folded in here
  // because `publishPage` doesn't need it; running it concurrently saves a
  // round-trip on every published-page render.
  const [loopData, mediaAssets, frontendInjections] = await Promise.all([
    prefetchLoopData(page, snapshot.site, ctx.db, ctx.url),
    prefetchMediaAssets(page, registry, ctx.db),
    collectFrontendInjections(ctx.db),
  ])
  const baseHtml = publishPage(page, snapshot.site, registry, {
    runtimeAssets: snapshot.runtimeAssets,
    runtimePackageImportmap: snapshot.runtimePackageImportmap,
    cssEmission: 'external',
    cssBundle,
    cssAssetBaseUrl: CSS_ASSET_BASE_URL,
    loopData,
    mediaAssets,
    loopEndpointBaseUrl: LOOP_ENDPOINT_BASE_URL,
    // Seed route frame from the actual request URL (when available) so
    // `{route.slug}` / `{route.path}` bindings resolve to live values.
    // publishPage falls back to the page permalink if no templateContext
    // is provided.
    templateContext: ctx.url
      ? { entryStack: [], route: buildRouteFrame(ctx.url.toString()) }
      : undefined,
  }).html
  const withInjections = injectFrontendAssets(baseHtml, frontendInjections)
  const filtered = await hookBus.applyFilter('publish.html', withInjections)
  await hookBus.emit('publish.after', { siteId: snapshot.site.id, pageId: snapshot.pageRowId })
  return filtered
}

export async function renderPublishedDataRowTemplate(
  snapshot: PublishedPageSnapshot,
  row: PublishedDataRow,
  ctx: RenderPublishedSnapshotContext,
): Promise<string | null> {
  const template = selectEntryTemplate(snapshot.site, row.tableSlug)
  if (!template) return null

  await hookBus.emit('publish.before', { siteId: snapshot.site.id, pageId: template.id })
  const cssBundle = buildSiteCssBundle(snapshot.site, registry)
  const [loopData, mediaAssets, frontendInjections] = await Promise.all([
    prefetchLoopData(template, snapshot.site, ctx.db, ctx.url),
    prefetchMediaAssets(template, registry, ctx.db),
    collectFrontendInjections(ctx.db),
  ])
  const baseHtml = publishPage(template, snapshot.site, registry, {
    // Seed the entry stack with the published row + route frame from
    // the request URL. Loop interceptors push/pop iteration items on
    // top of this stack; nodes outside any loop resolve their
    // `currentEntry` bindings against this seed. page/site/viewer
    // frames are filled by `publishPage` from the document.
    templateContext: {
      entryStack: [publishedDataRowToLoopItem(row)],
      ...(ctx.url ? { route: buildRouteFrame(ctx.url.toString()) } : {}),
    },
    runtimeAssets: snapshot.runtimeAssets,
    runtimePackageImportmap: snapshot.runtimePackageImportmap,
    cssEmission: 'external',
    cssBundle,
    cssAssetBaseUrl: CSS_ASSET_BASE_URL,
    loopData,
    mediaAssets,
    loopEndpointBaseUrl: LOOP_ENDPOINT_BASE_URL,
  }).html
  const withInjections = injectFrontendAssets(baseHtml, frontendInjections)
  const filtered = await hookBus.applyFilter('publish.html', withInjections)
  await hookBus.emit('publish.after', { siteId: snapshot.site.id, pageId: template.id })
  return filtered
}

// `injectFrontendAssets` lives in `frontendInjections.ts` so the preview
// runtime (`buildRuntimePreviewDocument`) can call the same helper — both
// surfaces must yield identical HTML + CSP so previews match published.
