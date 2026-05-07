import { handleAgentRequest, handleAgentToolResult } from './agentHandler'
import { handleCmsRequest } from './cms/handlers'
import type { DbClient } from './cms/db/client'
import {
  getContentEntryRedirectByRoute,
  getPublishedContentEntryByRoute,
} from './cms/contentRepository'
import { renderContentDocumentHtml } from './cms/contentRenderer'
import { getLatestPublishedSiteSnapshot, getPublishedPageBySlug } from './cms/publishRepository'
import { renderPublishedContentTemplate, renderPublishedSnapshot } from './cms/publicRenderer'
import { getSetupStatus } from './cms/repositories'
import { getPublishedRuntimeAsset } from './cms/runtimeAssetRepository'
import { handleLoopRequest, isLoopRuntimeAssetPath, serveLoopRuntimeAsset } from './cms/handlers/loop'
import { jsonResponse } from './http'
import { serveAdminApp, serveStaticFile } from './static'
import { registry } from '@core/module-engine/registry'
import type { CssBundleFile } from '@core/publisher/siteCssBundle'
import { buildSiteCssBundle } from './cms/siteCssBundle'

const VITE_DEV_URL = 'http://localhost:5173'

function adminUiNotBuiltResponse(pathname: string): Response {
  const targetUrl = `${VITE_DEV_URL}${pathname}`
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Admin UI not served on this port</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 32px; background: #000; color: #ededed; line-height: 1.5; }
  a { color: #fff; }
  code { background: #111; padding: 2px 6px; border-radius: 3px; }
</style>
</head>
<body>
<h1>Admin UI not served on this port</h1>
<p>This is the CMS API server (port 3001). In development, the admin UI is served by the Vite dev server.</p>
<p>Open <a href="${targetUrl}">${targetUrl}</a>.</p>
<p>If Vite isn't running yet, start it with <code>bun run dev</code> from the project root.</p>
</body>
</html>`
  return new Response(html, {
    status: 404,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

interface ServerRuntime {
  db: DbClient
  staticDir?: string
  uploadsDir?: string
}

function publicSlugFromPath(pathname: string): string {
  const trimmed = pathname.replace(/^\/+|\/+$/g, '')
  return trimmed === '' ? 'index' : trimmed
}

function contentRouteFromPath(pathname: string): { collectionRouteBase: string; entrySlug: string } | null {
  const parts = pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean)
  if (parts.length < 2) return null
  return {
    collectionRouteBase: `/${parts.slice(0, -1).map((part) => decodeURIComponent(part)).join('/')}`,
    entrySlug: decodeURIComponent(parts[parts.length - 1]),
  }
}

export async function handleServerRequest(
  req: Request,
  runtime: ServerRuntime,
): Promise<Response> {
  const url = new URL(req.url)

  if (url.pathname === '/health') {
    return jsonResponse({ status: 'ok', ts: Date.now() })
  }

  if (url.pathname.startsWith('/admin/api/cms/')) {
    return handleCmsRequest(req, runtime.db, { uploadsDir: runtime.uploadsDir })
  }

  if (url.pathname === '/api/agent') {
    return handleAgentRequest(req)
  }

  if (url.pathname === '/api/agent/tool-result') {
    return handleAgentToolResult(req)
  }

  // Loop runtime — fixed CMS asset, served before per-site runtime
  // assets so the request never falls through to the per-site lookup.
  if (req.method === 'GET' && isLoopRuntimeAssetPath(url.pathname)) {
    return serveLoopRuntimeAsset()
  }

  // Loop infinite-load endpoint.
  if (url.pathname.startsWith('/_pb/loop/')) {
    return handleLoopRequest(req, url, { db: runtime.db })
  }

  if (req.method === 'GET' && url.pathname.startsWith('/_pb/assets/')) {
    const runtimeAsset = await getPublishedRuntimeAsset(runtime.db, url.pathname)
    if (runtimeAsset) {
      const body = new ArrayBuffer(runtimeAsset.bytes.byteLength)
      new Uint8Array(body).set(runtimeAsset.bytes)
      return new Response(body, {
        headers: {
          'content-type': runtimeAsset.contentType,
          'cache-control': 'public, max-age=31536000, immutable',
        },
      })
    }
  }

  // Per-site CSS bundle — `reset-<hash>.css`, `framework-<hash>.css`,
  // `style-<hash>.css`. Filenames embed a content hash, so responses can use
  // `Cache-Control: immutable` for a year. Stale-hash requests 404 so the
  // browser falls back to refetching the HTML (which carries the new hash).
  //
  // The /_pb/css/ namespace is exclusive: any unknown path under it is a 404,
  // never falls through to the public-slug handler. That prevents an
  // unrelated path like `/_pb/css/anything.css` from accidentally rendering
  // the homepage (page-slug router doesn't know about CSS conventions).
  if (req.method === 'GET' && url.pathname.startsWith('/_pb/css/')) {
    return (await serveSiteCss(runtime.db, url.pathname)) ?? new Response('Not found', { status: 404 })
  }

  if (runtime.staticDir && url.pathname.startsWith('/assets/')) {
    const asset = await serveStaticFile(runtime.staticDir, url.pathname, req)
    if (asset) return asset
  }

  if (runtime.uploadsDir && url.pathname.startsWith('/uploads/')) {
    const upload = await serveStaticFile(runtime.uploadsDir, url.pathname.slice('/uploads'.length), req)
    if (upload) return upload
  }

  const isAdminPath = url.pathname === '/admin' || url.pathname.startsWith('/admin/')

  if (isAdminPath) {
    if (runtime.staticDir) {
      const adminApp = await serveAdminApp(runtime.staticDir, req)
      if (adminApp) return adminApp
    }
    // Admin SPA isn't served from this port (dev mode, or production
    // missing a build). Tell the developer where to actually find it.
    return adminUiNotBuiltResponse(url.pathname)
  }

  if (req.method === 'GET') {
    const snapshot = await getPublishedPageBySlug(runtime.db, publicSlugFromPath(url.pathname))
    if (snapshot) {
      return new Response(await renderPublishedSnapshot(snapshot, { db: runtime.db, url }), {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    }

    const contentRoute = contentRouteFromPath(url.pathname)
    if (contentRoute) {
      const entry = await getPublishedContentEntryByRoute(
        runtime.db,
        contentRoute.collectionRouteBase,
        contentRoute.entrySlug,
      )
      if (entry) {
        const siteSnapshot = await getLatestPublishedSiteSnapshot(runtime.db)
        const html = siteSnapshot
          ? await renderPublishedContentTemplate(siteSnapshot, entry, { db: runtime.db, url })
          : null
        return new Response(html ?? renderContentDocumentHtml(entry), {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })
      }

      const redirect = await getContentEntryRedirectByRoute(
        runtime.db,
        contentRoute.collectionRouteBase,
        contentRoute.entrySlug,
      )
      if (redirect) {
        return new Response(null, {
          status: 301,
          headers: { location: `${redirect.targetPath}${url.search}` },
        })
      }
    }

    // Public page didn't resolve. On a fresh install (no admin user yet)
    // bounce the visitor to /admin so they land in the setup wizard
    // instead of seeing a confusing 404.
    const setupStatus = await getSetupStatus(runtime.db)
    if (setupStatus.needsSetup) {
      return new Response(null, { status: 302, headers: { location: '/admin' } })
    }
  }

  return jsonResponse({ error: 'Not found' }, { status: 404 })
}

/**
 * Serve one of the three site CSS bundle files (reset / framework / style).
 *
 * The URL path is `/_pb/css/<bundle>-<hash>.css` where `<bundle>` is the
 * logical layer name and `<hash>` is the 12-hex SHA-256 prefix that
 * `buildSiteCssBundle` produces. We rebuild the bundle from the latest
 * published snapshot on every request, which is fine because:
 *
 *  - Bundles are tiny (kB) and the build is microseconds (deduped by moduleId).
 *  - Browsers / CDNs cache the response for a year (`immutable`), so this
 *    handler only fires for the FIRST visitor of a given hash.
 *  - When a hash changes (the site or its classes were edited), HTML pages
 *    re-render with the new `<link href>` referencing the new filename, and
 *    visitors fetch the new bundle exactly once.
 *
 * Stale hash → 404 so the browser falls back to refetching the HTML, which
 * carries the current hash. Returning the new content under the old name
 * would defeat `immutable` caching by serving different bytes for the same
 * URL across the cache lifetime.
 */
async function serveSiteCss(db: DbClient, pathname: string): Promise<Response | null> {
  const filename = pathname.slice('/_pb/css/'.length)
  const match = filename.match(/^(reset|framework|style)-([a-f0-9]{12})\.css$/)
  if (!match) return null

  const [, requestedBundle, requestedHash] = match
  const snapshot = await getLatestPublishedSiteSnapshot(db)
  if (!snapshot) return new Response('Not found', { status: 404 })

  const bundle = buildSiteCssBundle(snapshot.site, registry)
  const file: CssBundleFile = bundle[requestedBundle as 'reset' | 'framework' | 'style']
  if (file.hash !== requestedHash) {
    return new Response('Not found', { status: 404 })
  }

  return new Response(file.content, {
    headers: {
      'content-type': 'text/css; charset=utf-8',
      'cache-control': 'public, max-age=31536000, immutable',
      etag: `"${file.hash}"`,
    },
  })
}
