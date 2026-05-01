import type { DbClient } from './db'

export interface MediaAsset {
  id: string
  filename: string
  mimeType: string
  sizeBytes: number
  publicPath: string
  createdAt: string
}

export interface CreateMediaAssetInput {
  id: string
  filename: string
  mimeType: string
  sizeBytes: number
  storagePath: string
  publicPath: string
}

interface MediaAssetRow {
  id: string
  filename: string
  mime_type: string
  size_bytes: number | string
  public_path: string
  created_at: Date | string
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function mapMediaAsset(row: MediaAssetRow): MediaAsset {
  return {
    id: row.id,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    publicPath: row.public_path,
    createdAt: toIsoString(row.created_at),
  }
}

export async function createMediaAsset(
  db: DbClient,
  input: CreateMediaAssetInput,
): Promise<MediaAsset> {
  const result = await db.query<MediaAssetRow>(
    `insert into media_assets (id, filename, mime_type, size_bytes, storage_path, public_path)
     values ($1, $2, $3, $4, $5, $6)
     returning id, filename, mime_type, size_bytes, public_path, created_at`,
    [
      input.id,
      input.filename,
      input.mimeType,
      input.sizeBytes,
      input.storagePath,
      input.publicPath,
    ],
  )
  return mapMediaAsset(result.rows[0])
}

export async function listMediaAssets(db: DbClient): Promise<MediaAsset[]> {
  const result = await db.query<MediaAssetRow>(
    `select id, filename, mime_type, size_bytes, public_path, created_at
     from media_assets
     order by created_at desc`,
  )
  return result.rows.map(mapMediaAsset)
}
