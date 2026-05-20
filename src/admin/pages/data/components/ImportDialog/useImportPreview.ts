/**
 * useImportPreview — fetches a server-side diff of a SiteBundle against the
 * current local site.
 *
 * Calls `POST /admin/api/cms/import/preview` via `previewSiteBundle`.
 * No DB writes are performed — this is a read-only diff call.
 *
 * State transitions use the render-time reset pattern (not useEffect) to avoid
 * the react-hooks/set-state-in-effect lint rule. The async fetch uses an inline
 * IIFE so all setState calls happen after the first `await`, which is the
 * pattern required by the lint rule.
 */
import { useEffect, useState } from 'react'
import type { SiteBundle, BundlePreview } from '@core/data/bundleSchema'
import { previewSiteBundle } from '@core/persistence/cmsTransfer'

type PreviewState = {
  preview: BundlePreview | null
  loading: boolean
  error: string | null
}

export function useImportPreview(bundle: SiteBundle | null): PreviewState {
  // `trackedBundle` mirrors `bundle` one render behind — render-time diff
  // detection lets us reset state synchronously without a useEffect.
  const [trackedBundle, setTrackedBundle] = useState<SiteBundle | null>(null)
  const [state, setState] = useState<PreviewState>({
    preview: null,
    loading: false,
    error: null,
  })

  // Render-time reset: when the bundle identity changes, immediately reflect
  // the new idle/loading state. React batches these setState calls with the
  // current render and produces only one re-render.
  if (trackedBundle !== bundle) {
    setTrackedBundle(bundle)
    setState({ preview: null, loading: bundle !== null, error: null })
  }

  // Async fetch effect — all setState calls happen inside the async IIFE, after
  // the first `await`, so the lint rule is satisfied.
  useEffect(() => {
    if (!bundle) return
    let cancelled = false
    void (async () => {
      try {
        const result = await previewSiteBundle(bundle)
        if (cancelled) return
        setState({ preview: result, loading: false, error: null })
      } catch (err) {
        if (cancelled) return
        setState({
          preview: null,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to preview bundle',
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [bundle])

  return state
}
