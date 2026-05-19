import { useEffect, useMemo, useState } from 'react'
import { useParams } from '@admin/lib/routing'
import type { CmsPluginsPayload, PluginAdminPageRoute } from '@core/plugin-sdk'
import { listCmsPlugins } from '@core/persistence'
import { AdminPageLayout } from '@admin/layouts/AdminPageLayout'
import { PluginPageRenderer } from './components/PluginPageRenderer/PluginPageRenderer'
import styles from './PluginsPage.module.css'

const emptyPayload: CmsPluginsPayload = { plugins: [], adminPages: [] }

function pageHeading(page: PluginAdminPageRoute): string {
  if (page.content.kind === 'map') return page.content.heading
  if (page.content.kind === 'app') return page.content.heading
  if (page.content.kind === 'resource') return page.content.heading
  return page.content.heading ?? page.title
}

function pageDescription(page: PluginAdminPageRoute): string | undefined {
  if (page.content.kind === 'map' && page.content.body) return page.content.body
  return undefined
}

export function PluginPage() {
  const { pluginId = '', pageId = '' } = useParams()
  const [payload, setPayload] = useState<CmsPluginsPayload>(emptyPayload)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadPlugins() {
      setLoading(true)
      setError(null)
      try {
        const nextPayload = await listCmsPlugins()
        if (!cancelled) setPayload(nextPayload)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load plugin page')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadPlugins()
    return () => { cancelled = true }
  }, [])

  const page = useMemo<PluginAdminPageRoute | null>(() => {
    return payload.adminPages.find((candidate) =>
      candidate.pluginId === pluginId && candidate.id === pageId
    ) ?? null
  }, [pageId, payload.adminPages, pluginId])

  if (loading) {
    return (
      <AdminPageLayout workspace="pluginPage" title="Plugin page" titleId="plugin-page-title">
        <p className={styles.emptyState}>Loading plugin page...</p>
      </AdminPageLayout>
    )
  }

  if (error) {
    return (
      <AdminPageLayout workspace="pluginPage" title="Plugin page" titleId="plugin-page-title">
        <p className={styles.error} role="alert">{error}</p>
      </AdminPageLayout>
    )
  }

  if (!page) {
    return (
      <AdminPageLayout
        workspace="pluginPage"
        title="Plugin page unavailable"
        titleId="plugin-page-title"
        description="The plugin may be disabled, removed, or using a page that no longer exists."
      />
    )
  }

  return (
    <AdminPageLayout
      workspace="pluginPage"
      title={pageHeading(page)}
      titleId="plugin-page-title"
      description={pageDescription(page) ?? page.pluginName}
    >
      <div className={styles.pluginPageBody} data-testid="plugin-page-admin-canvas">
        <PluginPageRenderer page={page} />
      </div>
    </AdminPageLayout>
  )
}
