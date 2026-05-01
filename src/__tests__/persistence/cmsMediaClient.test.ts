import { describe, expect, it } from 'bun:test'
import {
  listCmsMediaAssets,
  uploadCmsMediaAsset,
} from '../../core/persistence/cmsMedia'

describe('CMS media client', () => {
  it('lists media assets with session credentials', async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []

    const assets = await listCmsMediaAssets(async (input, init) => {
      calls.push({ input, init })
      return new Response(JSON.stringify({
        assets: [{
          id: 'asset_1',
          filename: 'hero.png',
          mimeType: 'image/png',
          sizeBytes: 12,
          publicPath: '/uploads/asset_1-hero.png',
          createdAt: '2026-01-03T00:00:00.000Z',
        }],
      }), { status: 200 })
    })

    expect(assets).toHaveLength(1)
    expect(assets[0].publicPath).toBe('/uploads/asset_1-hero.png')
    expect(calls[0]).toMatchObject({
      input: '/api/cms/media',
      init: { method: 'GET', credentials: 'include' },
    })
  })

  it('uploads one file as multipart form data with session credentials', async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []
    const file = new File(['image-bytes'], 'hero.png', { type: 'image/png' })

    const asset = await uploadCmsMediaAsset(file, async (input, init) => {
      calls.push({ input, init })
      return new Response(JSON.stringify({
        asset: {
          id: 'asset_1',
          filename: 'hero.png',
          mimeType: 'image/png',
          sizeBytes: 12,
          publicPath: '/uploads/asset_1-hero.png',
          createdAt: '2026-01-03T00:00:00.000Z',
        },
      }), { status: 201 })
    })

    expect(asset.filename).toBe('hero.png')
    expect(calls[0]).toMatchObject({
      input: '/api/cms/media',
      init: { method: 'POST', credentials: 'include' },
    })
    expect(calls[0].init?.body).toBeInstanceOf(FormData)
  })

  it('surfaces API errors from the response body', async () => {
    await expect(
      listCmsMediaAssets(async () =>
        new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })),
    ).rejects.toThrow('Unauthorized')
  })
})
