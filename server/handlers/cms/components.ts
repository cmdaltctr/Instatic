/**
 * Visual Components CRUD endpoints backed by `data_rows` (table_id = 'components').
 *
 *   GET /admin/api/cms/components — list all non-deleted component rows as
 *                                   DataRow[] (gated by `site.read`). The client
 *                                   adapter converts these to VisualComponent[]
 *                                   via visualComponentFromRow + validateVisualComponents.
 *
 *   PUT /admin/api/cms/components — batch upsert the full component roster. The
 *                                   body carries `{ components: VisualComponent[] }`
 *                                   (the in-memory representation from the editor
 *                                   store). The server validates them, converts to
 *                                   cells via visualComponentToCells, and reconciles
 *                                   create/update/delete in one transaction.
 *                                   Gated by any of the three site-write capabilities.
 *
 * The GET response returns raw DataRow objects (not VisualComponent objects) so
 * the client adapter can reconstruct VCs via visualComponentFromRow without a
 * second validation layer on the server. The adapter validates via
 * validateVisualComponents immediately after conversion.
 */
import type { DbClient } from '../../db/client'
import { requireAnyCapability, requireCapability } from '../../auth/authz'
import { SITE_WRITE_CAPABILITIES } from '../../auth/capabilities'
import {
  listDataRows,
  createDataRow,
  saveDataRowDraft,
  softDeleteDataRow,
} from '../../repositories/data'
import {
  visualComponentToCells,
  vcSlugFromName,
} from '../../../src/core/data/componentFromRow'
import { parseVisualComponent } from '@core/visualComponents/schemas'
import type { VisualComponent } from '@core/visualComponents/schemas'
import { jsonResponse, methodNotAllowed, readJsonObject } from '../../http'
import { CMS_API_PREFIX } from './shared'

export async function handleComponentsRoutes(req: Request, db: DbClient): Promise<Response | null> {
  const url = new URL(req.url)
  if (url.pathname !== `${CMS_API_PREFIX}/components`) return null

  if (req.method === 'GET') {
    const user = await requireCapability(req, db, 'site.read')
    if (user instanceof Response) return user

    const rows = await listDataRows(db, 'components')
    return jsonResponse({ rows })
  }

  if (req.method === 'PUT') {
    const user = await requireAnyCapability(req, db, SITE_WRITE_CAPABILITIES)
    if (user instanceof Response) return user

    const body = await readJsonObject(req)
    const rawComponents = Array.isArray(body.components) ? body.components : []

    // Parse each VC from the raw array. Invalid entries are silently dropped —
    // the client sends the in-memory VisualComponent shape.
    const components: VisualComponent[] = rawComponents.flatMap((raw: unknown) => {
      const vc = parseVisualComponent(raw)
      return vc ? [vc] : []
    })

    // Batch reconcile: create / update / soft-delete in a transaction
    await db.transaction(async (tx) => {
      const existingRows = await listDataRows(tx, 'components')
      const existingById = new Map(existingRows.map((r) => [r.id, r]))
      const incomingIds = new Set(components.map((vc) => vc.id))

      for (const vc of components) {
        const cells = visualComponentToCells(vc)
        const slug = vcSlugFromName(vc.name)
        if (existingById.has(vc.id)) {
          await saveDataRowDraft(tx, vc.id, { cells, slug }, user.id)
        } else {
          await createDataRow(tx, { id: vc.id, tableId: 'components', cells, slug }, user.id)
        }
      }

      // Soft-delete rows no longer in the incoming set
      for (const [rowId] of existingById) {
        if (!incomingIds.has(rowId)) {
          await softDeleteDataRow(tx, rowId, user.id)
        }
      }
    })

    return jsonResponse({ ok: true })
  }

  return methodNotAllowed()
}
