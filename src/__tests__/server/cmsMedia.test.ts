import { describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { SESSION_COOKIE_NAME, hashSessionToken } from '../../../server/cms/auth'
import type { DbClient, DbResult } from '../../../server/cms/db'
import { handleCmsRequest } from '../../../server/cms/handlers'
import {
  createMediaAsset,
  listMediaAssets,
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
  init: { method?: string; formData?: FormData; headers?: Record<string, string> } = {},
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
})
