import { describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { SESSION_COOKIE_NAME, hashSessionToken } from '../../../server/cms/auth'
import type { DbClient, DbResult } from '../../../server/cms/db'
import { handleCmsRequest } from '../../../server/cms/handlers'
import {
  createMediaAsset,
  deleteMediaAsset,
  listMediaAssets,
  renameMediaAsset,
} from '../../../server/cms/mediaRepository'

class MediaFakeDb implements DbClient {
  admins: Record<string, unknown>[] = [
    {
      id: 'admin_1',
      email: 'owner@example.com',
      password_hash: 'hash',
      created_at: new Date('2026-01-01').toISOString(),
    },
  ]
  sessions: Record<string, unknown>[] = []
  media: Record<string, unknown>[] = []

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<DbResult<Row>> {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()
    if (normalized.startsWith('select admin_users.id, admin_users.email')) {
      const session = this.sessions.find((s) => String(s.id_hash) === String(params[0]))
      if (!session) return { rows: [], rowCount: 0 }
      const admin = this.admins.find((a) => a.id === session.admin_user_id)
      return { rows: admin ? [admin as Row] : [], rowCount: admin ? 1 : 0 }
    }
    if (normalized.startsWith('insert into media_assets')) {
      const row = {
        id: params[0],
        filename: params[1],
        mime_type: params[2],
        size_bytes: params[3],
        storage_path: params[4],
        public_path: params[5],
        created_at: new Date('2026-01-03').toISOString(),
      }
      this.media.push(row)
      return { rows: [row as Row], rowCount: 1 }
    }
    if (normalized.startsWith('select id, filename, mime_type')) {
      return { rows: [...this.media].reverse() as Row[], rowCount: this.media.length }
    }
    if (normalized.startsWith('update media_assets set filename')) {
      const row = this.media.find((asset) => asset.id === params[0])
      if (!row) return { rows: [], rowCount: 0 }
      row.filename = params[1]
      return { rows: [row as Row], rowCount: 1 }
    }
    if (normalized.startsWith('delete from media_assets')) {
      const index = this.media.findIndex((asset) => asset.id === params[0])
      if (index === -1) return { rows: [], rowCount: 0 }
      const [row] = this.media.splice(index, 1)
      return { rows: [row as Row], rowCount: 1 }
    }
    throw new Error(`Unhandled SQL: ${sql}`)
  }
}

async function createCookie(db: MediaFakeDb): Promise<string> {
  const token = 'valid-session-token'
  db.sessions.push({
    id_hash: await hashSessionToken(token),
    admin_user_id: 'admin_1',
    expires_at: new Date('2030-01-01').toISOString(),
  })
  return `${SESSION_COOKIE_NAME}=${token}`
}

function cmsRequest(
  url: string,
  init: { method?: string; formData?: FormData; headers?: Record<string, string>; body?: string } = {},
): Request {
  const headers = new Map(
    Object.entries(init.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]),
  )
  return {
    url,
    method: init.method ?? 'GET',
    headers: {
      get(name: string) {
        return headers.get(name.toLowerCase()) ?? null
      },
    },
    async formData() {
      return init.formData ?? new FormData()
    },
    async json() {
      return init.body ? JSON.parse(init.body) : {}
    },
  } as Request
}

describe('CMS media repository', () => {
  it('stores and lists media asset metadata newest-first', async () => {
    const db = new MediaFakeDb()

    await createMediaAsset(db, {
      id: 'asset_1',
      filename: 'hero.png',
      mimeType: 'image/png',
      sizeBytes: 12,
      storagePath: 'asset_1-hero.png',
      publicPath: '/uploads/asset_1-hero.png',
    })

    const assets = await listMediaAssets(db)

    expect(assets).toEqual([{
      id: 'asset_1',
      filename: 'hero.png',
      mimeType: 'image/png',
      sizeBytes: 12,
      publicPath: '/uploads/asset_1-hero.png',
      createdAt: '2026-01-03T00:00:00.000Z',
    }])
  })

  it('renames media asset metadata', async () => {
    const db = new MediaFakeDb()

    await createMediaAsset(db, {
      id: 'asset_1',
      filename: 'hero.png',
      mimeType: 'image/png',
      sizeBytes: 12,
      storagePath: 'asset_1-hero.png',
      publicPath: '/uploads/asset_1-hero.png',
    })

    const asset = await renameMediaAsset(db, 'asset_1', 'Hero renamed.png')

    expect(asset?.filename).toBe('Hero renamed.png')
    expect(db.media[0].filename).toBe('Hero renamed.png')
  })

  it('deletes media asset metadata and returns its storage path', async () => {
    const db = new MediaFakeDb()

    await createMediaAsset(db, {
      id: 'asset_1',
      filename: 'hero.png',
      mimeType: 'image/png',
      sizeBytes: 12,
      storagePath: 'asset_1-hero.png',
      publicPath: '/uploads/asset_1-hero.png',
    })

    const deleted = await deleteMediaAsset(db, 'asset_1')

    expect(deleted?.storagePath).toBe('asset_1-hero.png')
    expect(db.media).toHaveLength(0)
  })
})

describe('CMS media handlers', () => {
  it('requires an admin session for media listing', async () => {
    const res = await handleCmsRequest(
      cmsRequest('http://localhost/api/cms/media'),
      new MediaFakeDb(),
    )

    expect(res.status).toBe(401)
  })

  it('uploads image files to disk and stores metadata for authenticated admins', async () => {
    const db = new MediaFakeDb()
    const cookie = await createCookie(db)
    const uploadsDir = mkdtempSync(join(tmpdir(), 'page-builder-uploads-'))
    const body = new FormData()
    body.set('file', new File(['image-bytes'], 'Hero Image.png', { type: 'image/png' }))

    try {
      const res = await handleCmsRequest(
        cmsRequest('http://localhost/api/cms/media', {
          method: 'POST',
          headers: { cookie },
          formData: body,
        }),
        db,
        { uploadsDir },
      )

      expect(res.status).toBe(201)
      const payload = await res.json() as { asset: { filename: string; publicPath: string; mimeType: string } }
      expect(payload.asset).toMatchObject({
        filename: 'Hero Image.png',
        mimeType: 'image/png',
      })
      expect(payload.asset.publicPath).toStartWith('/uploads/')
      expect(db.media).toHaveLength(1)
      expect(await readFile(join(uploadsDir, String(db.media[0].storage_path)), 'utf-8')).toBe('image-bytes')
    } finally {
      rmSync(uploadsDir, { recursive: true, force: true })
    }
  })

  it('lists uploaded media assets for authenticated admins', async () => {
    const db = new MediaFakeDb()
    const cookie = await createCookie(db)
    await createMediaAsset(db, {
      id: 'asset_1',
      filename: 'hero.png',
      mimeType: 'image/png',
      sizeBytes: 12,
      storagePath: 'asset_1-hero.png',
      publicPath: '/uploads/asset_1-hero.png',
    })

    const res = await handleCmsRequest(
      cmsRequest('http://localhost/api/cms/media', {
        headers: { cookie },
      }),
      db,
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      assets: [{ filename: 'hero.png', publicPath: '/uploads/asset_1-hero.png' }],
    })
  })

  it('renames uploaded media assets for authenticated admins', async () => {
    const db = new MediaFakeDb()
    const cookie = await createCookie(db)
    await createMediaAsset(db, {
      id: 'asset_1',
      filename: 'hero.png',
      mimeType: 'image/png',
      sizeBytes: 12,
      storagePath: 'asset_1-hero.png',
      publicPath: '/uploads/asset_1-hero.png',
    })

    const res = await handleCmsRequest(
      cmsRequest('http://localhost/api/cms/media/asset_1', {
        method: 'PATCH',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ filename: 'Hero renamed.png' }),
      }),
      db,
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      asset: { filename: 'Hero renamed.png', publicPath: '/uploads/asset_1-hero.png' },
    })
  })

  it('deletes uploaded media assets and removes their stored file for authenticated admins', async () => {
    const db = new MediaFakeDb()
    const cookie = await createCookie(db)
    const uploadsDir = mkdtempSync(join(tmpdir(), 'page-builder-uploads-'))
    await createMediaAsset(db, {
      id: 'asset_1',
      filename: 'hero.png',
      mimeType: 'image/png',
      sizeBytes: 12,
      storagePath: 'asset_1-hero.png',
      publicPath: '/uploads/asset_1-hero.png',
    })
    await writeFile(join(uploadsDir, 'asset_1-hero.png'), 'image-bytes')

    try {
      const res = await handleCmsRequest(
        cmsRequest('http://localhost/api/cms/media/asset_1', {
          method: 'DELETE',
          headers: { cookie },
        }),
        db,
        { uploadsDir },
      )

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true })
      expect(db.media).toHaveLength(0)
      await expect(readFile(join(uploadsDir, 'asset_1-hero.png'), 'utf-8')).rejects.toThrow()
    } finally {
      rmSync(uploadsDir, { recursive: true, force: true })
    }
  })
})
