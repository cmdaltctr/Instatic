/**
 * Bidirectional adapter between `VisualComponent` (in-memory type) and
 * `DataRow` / `DataRowCells` (the unified storage layer).
 *
 * Visual Components are stored in `data_rows` where `table_id = 'components'`.
 * The `components` system table fields map to VisualComponent fields as follows:
 *
 *   row.id               → vc.id   (the row id IS the VC id — id space unchanged)
 *   cells.name           → vc.name
 *   cells.body           → { nodes, rootNodeId } (pageTree field = VC tree)
 *   cells.params         → vc.params (VCParam[] stored as JSON array)
 *   cells.classIds       → vc.classIds (string[] stored as JSON array)
 *   row.createdAt (ISO)  → vc.createdAt (epoch ms)
 *
 * `breakpoints` was dropped from VisualComponentSchema in the Step 4 refactor:
 * VCs always use the site's breakpoint set (`site.breakpoints`); the per-VC
 * field was never read anywhere and is not stored.
 */

import type { DataRow, DataRowCells } from '@core/data/schemas'
import { parseVisualComponent, type VisualComponent } from '@core/visualComponents/schemas'

// ---------------------------------------------------------------------------
// DataRow → VisualComponent
// ---------------------------------------------------------------------------

/**
 * Reconstruct a `VisualComponent` from a `DataRow` (table_id = 'components').
 *
 * Uses `parseVisualComponent` internally so all tolerance logic (missing
 * classIds, unknown param types, etc.) is centralised. Returns `null` when the
 * row's cells are so corrupt that a valid VC cannot be reconstructed.
 */
export function visualComponentFromRow(row: DataRow): VisualComponent | null {
  const cells = row.cells

  // Build the raw VC shape that parseVisualComponent expects.
  // cells.body is a pageTree cell: { nodes, rootNodeId }.
  const rawVC = {
    id: row.id,
    name: typeof cells.name === 'string' ? cells.name : '',
    tree: cells.body ?? { nodes: {}, rootNodeId: '' },
    params: Array.isArray(cells.params) ? cells.params : [],
    classIds: Array.isArray(cells.classIds)
      ? cells.classIds.filter((x): x is string => typeof x === 'string')
      : [],
    // Convert ISO datetime string to epoch milliseconds.
    createdAt: typeof row.createdAt === 'string'
      ? (Date.parse(row.createdAt) || Date.now())
      : Date.now(),
  }

  return parseVisualComponent(rawVC)
}

// ---------------------------------------------------------------------------
// VisualComponent → DataRowCells
// ---------------------------------------------------------------------------

/**
 * Convert a `VisualComponent` to the `DataRowCells` shape for storage in
 * `data_rows`.
 *
 * The `slug` is derived from the name (kebab-case) and should also be passed
 * as the `slug` parameter to `createDataRow` / `saveDataRowDraft` (the
 * denormalized column on `data_rows`). Uniqueness is enforced by the
 * `data_rows_table_slug_active_idx` partial index.
 */
export function visualComponentToCells(vc: VisualComponent): DataRowCells {
  return {
    name: vc.name,
    slug: slugFromName(vc.name),
    body: {
      nodes: vc.tree.nodes,
      rootNodeId: vc.tree.rootNodeId,
    },
    params: vc.params,
    classIds: vc.classIds,
  }
}

/**
 * Derive the storage slug from a Visual Component name.
 * Converts to lower-kebab-case; falls back to 'component' on empty input.
 */
export function vcSlugFromName(name: string): string {
  return slugFromName(name)
}

function slugFromName(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '')
  return slug || 'component'
}
