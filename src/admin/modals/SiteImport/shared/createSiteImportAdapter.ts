/**
 * createSiteImportAdapter — wires the Super Import pipeline to the editor
 * store and the CMS media upload endpoint.
 *
 * Upload: POST /admin/api/cms/media (same endpoint as the media workspace).
 * Commit: calls useEditorStore.getState().mutateAllPagesAndSite in one
 *         atomic Immer producer → single Cmd+Z undo step.
 */

import { Type } from '@sinclair/typebox'
import type { SiteImportAdapter, SiteImportTransaction } from '@core/siteImport'
import { parseJsonResponse } from '@core/utils/jsonValidate'
import { responseErrorMessage } from '@core/persistence/httpErrors'
import { useEditorStore } from '@site/store/store'

// Minimal TypeBox schema for the upload response — only `publicPath` is needed.
const MediaUploadResponseSchema = Type.Object(
  {
    asset: Type.Object(
      { publicPath: Type.String() },
      { additionalProperties: true },
    ),
  },
  { additionalProperties: true },
)

export interface AdapterCallbacks {
  /** Stable id for the upload session (for logging). */
  sessionId: string
  /** Called before each asset upload begins. */
  onUploadStart?(asset: { path: string }): void
  /** Called after each asset upload completes. */
  onUploadComplete?(asset: { path: string; url: string }): void
  /** Called before the atomic store commit. */
  onCommitStart?(): void
  /** Called after the atomic store commit succeeds. */
  onCommitComplete?(): void
}

function basename(path: string): string {
  return path.split('/').pop() ?? path
}

export function createSiteImportAdapter(opts: AdapterCallbacks): SiteImportAdapter {
  return {
    async uploadAsset({ path, bytes, mimeType }) {
      opts.onUploadStart?.({ path })
      const form = new FormData()
      // bytes comes from fflate/File APIs — always backed by a plain ArrayBuffer.
      // TypeScript's BlobPart constraint excludes SharedArrayBuffer; the cast is safe.
      const blobData: ArrayBuffer = bytes.slice().buffer as ArrayBuffer
      form.append('file', new Blob([blobData], { type: mimeType }), basename(path))
      const res = await fetch('/admin/api/cms/media', { method: 'POST', body: form })
      if (!res.ok) {
        const errMsg = await responseErrorMessage(res, 'Upload failed')
        throw new Error(`[siteImportAdapter] Upload failed for ${path}: ${errMsg}`)
      }
      const payload = await parseJsonResponse(res, MediaUploadResponseSchema)
      opts.onUploadComplete?.({ path, url: payload.asset.publicPath })
      return payload.asset.publicPath
    },

    async commit(recipe) {
      opts.onCommitStart?.()
      const ok = useEditorStore.getState().mutateAllPagesAndSite((_site, helpers) => {
        const tx: SiteImportTransaction = {
          addPage: (input) => helpers.addPage(input),
          addStyleRule: (rule) => helpers.addStyleRule(rule),
          overwritePage: (id, input) => helpers.overwritePage(id, input),
          overwriteStyleRule: (id, rule) => helpers.overwriteStyleRule(id, rule),
        }
        recipe(tx)
        return true
      })
      if (!ok) {
        throw new Error('[siteImportAdapter] Commit failed: editor store rejected the mutation')
      }
      opts.onCommitComplete?.()
    },
  }
}
