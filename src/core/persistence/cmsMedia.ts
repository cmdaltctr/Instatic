import { responseErrorMessage } from './httpErrors'

export interface CmsMediaAsset {
  id: string
  filename: string
  mimeType: string
  sizeBytes: number
  publicPath: string
  createdAt: string
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export async function listCmsMediaAssets(
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  basePath = '/api/cms',
): Promise<CmsMediaAsset[]> {
  const res = await fetchImpl(`${basePath}/media`, {
    method: 'GET',
    credentials: 'include',
  })
  if (!res.ok) {
    throw new Error(await responseErrorMessage(res, `CMS media listing failed with ${res.status}`))
  }
  const body = await res.json() as { assets?: CmsMediaAsset[] }
  return Array.isArray(body.assets) ? body.assets : []
}

export async function uploadCmsMediaAsset(
  file: File,
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  basePath = '/api/cms',
): Promise<CmsMediaAsset> {
  const body = new FormData()
  body.set('file', file)

  const res = await fetchImpl(`${basePath}/media`, {
    method: 'POST',
    credentials: 'include',
    body,
  })
  if (!res.ok) {
    throw new Error(await responseErrorMessage(res, `CMS media upload failed with ${res.status}`))
  }
  const payload = await res.json() as { asset: CmsMediaAsset }
  return payload.asset
}

export async function renameCmsMediaAsset(
  assetId: string,
  filename: string,
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  basePath = '/api/cms',
): Promise<CmsMediaAsset> {
  const res = await fetchImpl(`${basePath}/media/${encodeURIComponent(assetId)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ filename }),
  })
  if (!res.ok) {
    throw new Error(await responseErrorMessage(res, `CMS media rename failed with ${res.status}`))
  }
  const payload = await res.json() as { asset: CmsMediaAsset }
  return payload.asset
}

export async function deleteCmsMediaAsset(
  assetId: string,
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  basePath = '/api/cms',
): Promise<void> {
  const res = await fetchImpl(`${basePath}/media/${encodeURIComponent(assetId)}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!res.ok) {
    throw new Error(await responseErrorMessage(res, `CMS media delete failed with ${res.status}`))
  }
}
