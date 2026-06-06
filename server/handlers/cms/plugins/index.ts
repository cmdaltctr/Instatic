/**
 * Plugin admin endpoints — capabilities split per-route. The dispatcher
 * resolves each request to a (`plugins.read` / `plugins.configure` /
 * `plugins.install` / `plugins.lifecycle`) gate plus optional step-up.
 * See `resolvePluginRoutePolicy` below for the matrix.
 *
 *   GET    /admin/api/cms/plugins                                   — list installed plugins + admin pages
 *   POST   /admin/api/cms/plugins                                   — install from a manifest JSON body
 *   POST   /admin/api/cms/plugins/inspect-package                   — read a plugin .zip without installing
 *   POST   /admin/api/cms/plugins/package                           — install (or upgrade) from a .zip
 *   PATCH  /admin/api/cms/plugins/:id                               — enable / disable an installed plugin
 *   DELETE /admin/api/cms/plugins/:id                               — uninstall + delete on-disk assets
 *   POST   /admin/api/cms/plugins/:id/pack/install                  — manual pack re-sync into the draft site
 *   GET    /admin/api/cms/plugins/:id/settings                      — masked settings
 *   PUT    /admin/api/cms/plugins/:id/settings                      — update settings + fire `settings.changed`
 *   POST   /admin/api/cms/plugins/:id/restart                       — manual restart for a parked plugin
 *   GET    /admin/api/cms/plugins/events                            — SSE stream of lifecycle events
 *   GET    /admin/api/cms/plugins/:id/resources/:rid/records        — list records for a plugin resource
 *   POST   /admin/api/cms/plugins/:id/resources/:rid/records        — create a plugin record
 *   PATCH  /admin/api/cms/plugins/:id/resources/:rid/records/:rec   — update a plugin record
 *   DELETE /admin/api/cms/plugins/:id/resources/:rid/records/:rec   — delete a plugin record
 *   *      /admin/api/cms/plugins/:id/runtime/...                   — opaque runtime requests handled by
 *                                                                     the plugin's own server module
 *
 * `handlePluginsRoutes` is a thin dispatcher: it matches the URL pattern,
 * resolves the per-route capability + step-up policy via
 * `resolvePluginRoutePolicy`, runs the gate, and forwards to one of the
 * per-route handlers in the topic files (`install.ts`, `state.ts`,
 * `settings.ts`, `pack.ts`, `records.ts`, `events.ts`). The lifecycle hook
 * orchestration lives in `lifecycle.ts`; cross-cutting helpers
 * (`pluginsPayload`, audit envelope, permission grants, on-disk assets)
 * live in `shared.ts`.
 */
import type { DbClient } from '../../../db/client'
import type { CoreCapability } from '../../../auth/capabilities'
import { requireCapability, requireStepUp } from '../../../auth/authz'
import {
  handleServerPluginRuntimeRequest,
  setPluginWorkerDbClient,
} from '../../../plugins/runtime'
import { jsonResponse } from '../../../http'
import { type CmsHandlerOptions } from '../shared'
import {
  handleInspectPackage,
  handlePackageInstall,
  handlePluginsCollection,
} from './install'
import { handlePluginPackInstall } from './pack'
import { handlePluginItem, handlePluginRestart } from './state'
import { handlePluginSettings } from './settings'
import {
  handlePluginRecordItem,
  handlePluginRecordsCollection,
} from './records'
import { handlePluginEventsStream } from './events'
import {
  handlePluginSchedulePause,
  handlePluginScheduleResume,
  handlePluginScheduleRunNow,
  handlePluginSchedulesList,
} from './schedules'

// ---------------------------------------------------------------------------
// Route patterns
// ---------------------------------------------------------------------------

const PLUGIN_ITEM_PATTERN = /^\/admin\/api\/cms\/plugins\/([^/]+)$/
const PLUGIN_RECORDS_PATTERN = /^\/admin\/api\/cms\/plugins\/([^/]+)\/resources\/([^/]+)\/records$/
const PLUGIN_RECORD_ITEM_PATTERN = /^\/admin\/api\/cms\/plugins\/([^/]+)\/resources\/([^/]+)\/records\/([^/]+)$/
const PLUGIN_RUNTIME_PATTERN = /^\/admin\/api\/cms\/plugins\/([^/]+)\/runtime(?:\/.*)?$/
const PLUGIN_PACK_INSTALL_PATTERN = /^\/admin\/api\/cms\/plugins\/([^/]+)\/pack\/install$/
const PLUGIN_SETTINGS_PATTERN = /^\/admin\/api\/cms\/plugins\/([^/]+)\/settings$/
const PLUGIN_RESTART_PATTERN = /^\/admin\/api\/cms\/plugins\/([^/]+)\/restart$/
const PLUGIN_SCHEDULES_PATTERN = /^\/admin\/api\/cms\/plugins\/([^/]+)\/schedules$/
const PLUGIN_SCHEDULE_RUN_NOW_PATTERN = /^\/admin\/api\/cms\/plugins\/([^/]+)\/schedules\/([^/]+)\/run-now$/
const PLUGIN_SCHEDULE_PAUSE_PATTERN = /^\/admin\/api\/cms\/plugins\/([^/]+)\/schedules\/([^/]+)\/pause$/
const PLUGIN_SCHEDULE_RESUME_PATTERN = /^\/admin\/api\/cms\/plugins\/([^/]+)\/schedules\/([^/]+)\/resume$/
const PLUGIN_EVENTS_PATH = '/admin/api/cms/plugins/events'

// ---------------------------------------------------------------------------
// Per-route capability + step-up policy
//
// The legacy single-capability gate (`plugins.manage`) collapsed four very
// different blast radii — view, configure, install (RCE-class), lifecycle —
// into one grant. We split per-route so a "Site Operator" custom role can
// hold `plugins.lifecycle` without also being able to install new plugins.
//
// `resolvePluginRoutePolicy` returns the required capability + step-up
// expectation for the matched route. The capability is required ALWAYS;
// step-up is required only for `stepUp: true` entries (a fresh password
// re-entry on top, mirroring users.ts delete / password.change).
// ---------------------------------------------------------------------------

interface PluginRoutePolicy {
  capability: CoreCapability
  stepUp: boolean
}

function resolvePluginRoutePolicy(method: string, pathname: string): PluginRoutePolicy {
  // Fresh install / upgrade — uploads + executes arbitrary plugin code. RCE.
  if (method === 'POST' && pathname === '/admin/api/cms/plugins') {
    return { capability: 'plugins.install', stepUp: true }
  }
  if (method === 'POST' && pathname === '/admin/api/cms/plugins/package') {
    return { capability: 'plugins.install', stepUp: true }
  }
  if (method === 'POST' && pathname === '/admin/api/cms/plugins/inspect-package') {
    // Read-only — inspect a .zip before deciding to install. Same audience
    // as the install endpoint (someone deciding whether to run untrusted
    // code), but the operation itself never touches the host.
    return { capability: 'plugins.install', stepUp: false }
  }
  // Pack install — re-syncs a plugin's bundled modules/loops/VCs into the
  // draft site. Runs plugin code in the worker.
  if (method === 'POST' && PLUGIN_PACK_INSTALL_PATTERN.test(pathname)) {
    return { capability: 'plugins.install', stepUp: true }
  }

  // PATCH/DELETE on the item endpoint = enable/disable/uninstall.
  if (method === 'DELETE' && PLUGIN_ITEM_PATTERN.test(pathname)) {
    // Uninstall = the install endpoint's inverse; RCE-class risk if
    // forged (deletes plugin assets, runs the uninstall lifecycle hook).
    return { capability: 'plugins.install', stepUp: true }
  }
  if (method === 'PATCH' && PLUGIN_ITEM_PATTERN.test(pathname)) {
    // Enable / disable — runs activate / deactivate hooks; lifecycle.
    return { capability: 'plugins.lifecycle', stepUp: true }
  }
  if (method === 'POST' && PLUGIN_RESTART_PATTERN.test(pathname)) {
    return { capability: 'plugins.lifecycle', stepUp: true }
  }

  // Schedule mutations — run-now fires arbitrary plugin code immediately;
  // pause/resume change which schedules tick.
  if (method === 'POST' && PLUGIN_SCHEDULE_RUN_NOW_PATTERN.test(pathname)) {
    return { capability: 'plugins.lifecycle', stepUp: true }
  }
  if (method === 'POST' && PLUGIN_SCHEDULE_PAUSE_PATTERN.test(pathname)) {
    return { capability: 'plugins.lifecycle', stepUp: true }
  }
  if (method === 'POST' && PLUGIN_SCHEDULE_RESUME_PATTERN.test(pathname)) {
    return { capability: 'plugins.lifecycle', stepUp: true }
  }

  // Per-plugin settings — bounded by the plugin's own schema, but step-up
  // gated because settings changes fire the plugin's `settings.changed`
  // hook with the new values.
  if (method === 'PUT' && PLUGIN_SETTINGS_PATTERN.test(pathname)) {
    return { capability: 'plugins.configure', stepUp: true }
  }
  if (method === 'GET' && PLUGIN_SETTINGS_PATTERN.test(pathname)) {
    return { capability: 'plugins.configure', stepUp: false }
  }

  // Per-plugin records — bounded by the plugin's own resource schemas.
  // Read = `plugins.read`; write = `plugins.configure` (settings-class).
  if (PLUGIN_RECORD_ITEM_PATTERN.test(pathname) || PLUGIN_RECORDS_PATTERN.test(pathname)) {
    if (method === 'GET') return { capability: 'plugins.read', stepUp: false }
    return { capability: 'plugins.configure', stepUp: false }
  }

  // Read-only routes — collection list, schedules list, events SSE.
  // Anyone with the read cap can inspect plugin state.
  return { capability: 'plugins.read', stepUp: false }
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export async function handlePluginsRoutes(
  req: Request,
  db: DbClient,
  options: CmsHandlerOptions,
): Promise<Response | null> {
  const url = new URL(req.url)
  const { pathname } = url

  // Make sure the plugin worker host knows the current DbClient before any
  // worker-initiated `cms.storage.*` round-trip lands. Idempotent; the host
  // just stores the reference. Required because `activateInstalledServerPlugins`
  // (the canonical setter) only runs at boot and after disable/enable cycles —
  // without this call, a fresh install or upgrade would see api dispatches
  // fail with "no DbClient configured" until the next boot.
  setPluginWorkerDbClient(db)

  // Plugin runtime is a pass-through to the plugin's own server module — its
  // capability gating lives inside `handleServerPluginRuntimeRequest` because
  // the module decides which routes are public vs. authenticated.
  if (PLUGIN_RUNTIME_PATTERN.test(pathname)) {
    return (
      (await handleServerPluginRuntimeRequest(req, db)) ??
      jsonResponse({ error: 'Plugin route not found' }, { status: 404 })
    )
  }

  // Per-route capability + step-up gate. See `resolvePluginRoutePolicy`
  // above for the matrix. Splits the old `plugins.manage` mega-cap into
  // `plugins.read / configure / install / lifecycle`.
  if (!isPluginAdminPath(pathname)) return null
  const policy = resolvePluginRoutePolicy(req.method, pathname)
  const user = await requireCapability(req, db, policy.capability)
  if (user instanceof Response) return user
  if (policy.stepUp) {
    const stepUp = await requireStepUp(req, db, user)
    if (stepUp) return stepUp
  }

  if (pathname === '/admin/api/cms/plugins') {
    return handlePluginsCollection(req, db, user)
  }

  if (pathname === '/admin/api/cms/plugins/inspect-package') {
    return handleInspectPackage(req)
  }

  if (pathname === '/admin/api/cms/plugins/package') {
    return handlePackageInstall(req, db, options, user)
  }

  const packInstallMatch = pathname.match(PLUGIN_PACK_INSTALL_PATTERN)
  if (packInstallMatch) {
    return handlePluginPackInstall(req, db, options, user, decodeURIComponent(packInstallMatch[1]))
  }

  const settingsMatch = pathname.match(PLUGIN_SETTINGS_PATTERN)
  if (settingsMatch) {
    return handlePluginSettings(req, db, user, decodeURIComponent(settingsMatch[1]))
  }

  const restartMatch = pathname.match(PLUGIN_RESTART_PATTERN)
  if (restartMatch) {
    return handlePluginRestart(req, db, options, user, decodeURIComponent(restartMatch[1]))
  }

  // Schedule routes — read-only list, plus mutation endpoints
  // (run-now / pause / resume). The mutation ones are gated by
  // `plugins.lifecycle` + step-up (set by `resolvePluginRoutePolicy`);
  // the list is read-only and only needs `plugins.read`.
  const scheduleRunNowMatch = pathname.match(PLUGIN_SCHEDULE_RUN_NOW_PATTERN)
  if (scheduleRunNowMatch) {
    return handlePluginScheduleRunNow(
      req,
      db,
      decodeURIComponent(scheduleRunNowMatch[1]),
      decodeURIComponent(scheduleRunNowMatch[2]),
    )
  }
  const schedulePauseMatch = pathname.match(PLUGIN_SCHEDULE_PAUSE_PATTERN)
  if (schedulePauseMatch) {
    return handlePluginSchedulePause(
      req,
      db,
      decodeURIComponent(schedulePauseMatch[1]),
      decodeURIComponent(schedulePauseMatch[2]),
    )
  }
  const scheduleResumeMatch = pathname.match(PLUGIN_SCHEDULE_RESUME_PATTERN)
  if (scheduleResumeMatch) {
    return handlePluginScheduleResume(
      req,
      db,
      decodeURIComponent(scheduleResumeMatch[1]),
      decodeURIComponent(scheduleResumeMatch[2]),
    )
  }
  const schedulesMatch = pathname.match(PLUGIN_SCHEDULES_PATTERN)
  if (schedulesMatch) {
    return handlePluginSchedulesList(req, db, decodeURIComponent(schedulesMatch[1]))
  }

  if (pathname === PLUGIN_EVENTS_PATH) {
    return handlePluginEventsStream(req)
  }

  const recordItemMatch = pathname.match(PLUGIN_RECORD_ITEM_PATTERN)
  if (recordItemMatch) {
    return handlePluginRecordItem(
      req,
      db,
      decodeURIComponent(recordItemMatch[1]),
      decodeURIComponent(recordItemMatch[2]),
      decodeURIComponent(recordItemMatch[3]),
    )
  }

  const recordsMatch = pathname.match(PLUGIN_RECORDS_PATTERN)
  if (recordsMatch) {
    return handlePluginRecordsCollection(
      req,
      db,
      decodeURIComponent(recordsMatch[1]),
      decodeURIComponent(recordsMatch[2]),
    )
  }

  const itemMatch = pathname.match(PLUGIN_ITEM_PATTERN)
  if (itemMatch) {
    return handlePluginItem(req, db, options, user, decodeURIComponent(itemMatch[1]))
  }

  return null
}

/**
 * Quick check that `pathname` is one of the plugin admin routes — the
 * runtime route is handled separately above. Centralising the prefix keeps
 * the dispatcher's auth gate from running on unrelated CMS paths.
 */
function isPluginAdminPath(pathname: string): boolean {
  if (pathname === '/admin/api/cms/plugins') return true
  if (pathname === '/admin/api/cms/plugins/inspect-package') return true
  if (pathname === '/admin/api/cms/plugins/package') return true
  return pathname.startsWith('/admin/api/cms/plugins/')
}
