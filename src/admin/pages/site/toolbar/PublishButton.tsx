import { useCallback, useEffect, useRef, useState } from 'react'
import { selectActivePage, useEditorStore } from '@site/store/store'
import { pagePublicPath } from '@core/page-tree/slugs'
import { getCmsPublishStatus, publishCmsDraft } from '@core/persistence'
import { LoaderIcon } from 'pixel-art-icons/icons/loader'
import { CheckIcon } from 'pixel-art-icons/icons/check'
import { CircleAlertSolidIcon } from 'pixel-art-icons/icons/circle-alert-solid'
import { CloudUploadSolidIcon } from 'pixel-art-icons/icons/cloud-upload-solid'
import { ExternalLinkSolidIcon } from 'pixel-art-icons/icons/external-link-solid'
import { EyeSolidIcon } from 'pixel-art-icons/icons/eye-solid'
import { SaveSolidIcon } from 'pixel-art-icons/icons/save-solid'
import type { PersistenceSaveStatus } from '@site/hooks/usePersistence'
import { PublishActionGroup, type PublishActionMenuItem } from './PublishActionGroup'

type PublishState = 'idle' | 'publishing' | 'published' | 'error'

interface PublishButtonProps {
  enabled?: boolean
  onSave?: () => void | Promise<void>
  saveStatus?: PersistenceSaveStatus
}

export function PublishButton({ enabled = true, onSave, saveStatus }: PublishButtonProps) {
  const site = useEditorStore((s) => s.site)
  const siteId = useEditorStore((s) => s.site?.id ?? null)
  const activePage = useEditorStore(selectActivePage)
  const openPreview = useEditorStore((s) => s.openPreview)
  const hasUnsavedChanges = useEditorStore((s) => s.hasUnsavedChanges)
  const [state, setState] = useState<PublishState>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isStatusSaving = saveStatus?.state === 'saving'
  const saveError = saveStatus?.state === 'error' ? saveStatus.message ?? 'Save failed' : null

  useEffect(() => {
    return () => {
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!enabled || !siteId) return
    let cancelled = false

    async function loadPublishStatus() {
      try {
        const status = await getCmsPublishStatus()
        if (cancelled) return
        if (status.draftMatchesPublished) {
          setState('published')
          setMessage(null)
        }
      } catch (err) {
        console.warn('[toolbar] Failed to load publish status:', err)
      }
    }

    void loadPublishStatus()
    return () => { cancelled = true }
  }, [enabled, siteId])

  useEffect(() => {
    if (!hasUnsavedChanges || state !== 'published') return
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current)
    statusTimerRef.current = null
    const resetTimer = setTimeout(() => {
      setState('idle')
      setMessage(null)
    }, 0)
    return () => clearTimeout(resetTimer)
  }, [hasUnsavedChanges, state])

  const resetErrorLater = useCallback(() => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current)
    statusTimerRef.current = setTimeout(() => {
      setState('idle')
      setMessage(null)
      statusTimerRef.current = null
    }, 5000)
  }, [])

  const clearMessageLater = useCallback(() => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current)
    statusTimerRef.current = setTimeout(() => {
      setMessage(null)
      statusTimerRef.current = null
    }, 5000)
  }, [])

  const handlePublish = useCallback(async () => {
    if (!site || !enabled || state === 'publishing') return

    if (statusTimerRef.current) {
      clearTimeout(statusTimerRef.current)
      statusTimerRef.current = null
    }

    setState('publishing')
    setMessage(null)

    try {
      await onSave?.()
      const result = await publishCmsDraft()
      setState('published')
      setMessage(
        result.publishedPages === 1
          ? '1 page published'
          : `${result.publishedPages} pages published`,
      )
      clearMessageLater()
    } catch (err) {
      setState('error')
      setMessage(err instanceof Error ? err.message : 'Unknown publish error')
      resetErrorLater()
    }
  }, [clearMessageLater, enabled, onSave, site, resetErrorLater, state])

  const handleManualSave = useCallback(async () => {
    if (!onSave || isSaving || isStatusSaving) return
    setIsSaving(true)
    try {
      await onSave()
    } catch (err) {
      console.error('[toolbar] Manual save failed:', err)
    } finally {
      setIsSaving(false)
    }
  }, [isSaving, isStatusSaving, onSave])

  const isPublishing = state === 'publishing'
  const disabled = !site || !enabled || isPublishing
  const label =
    isPublishing ? 'Publishing' :
    state === 'published' ? 'Published' :
    state === 'error' ? 'Retry publish' :
    'Publish'

  const status =
    saveError ? {
      label: 'Draft save failed',
      tone: 'danger' as const,
      ariaLabel: saveError,
    } :
    isStatusSaving || isSaving ? {
      label: 'Saving draft',
      tone: 'neutral' as const,
    } :
    hasUnsavedChanges ? {
      label: 'Unsaved draft',
      tone: 'warning' as const,
    } :
    {
      label: 'Draft saved',
      tone: 'success' as const,
    }

  const PublishIcon =
    isPublishing ? LoaderIcon :
    state === 'published' ? CheckIcon :
    state === 'error' ? CircleAlertSolidIcon :
    CloudUploadSolidIcon

  const menuItems: PublishActionMenuItem[] = [
    {
      id: 'save-draft',
      label: 'Save draft',
      icon: SaveSolidIcon,
      disabled: !onSave || isSaving || isStatusSaving,
      onSelect: handleManualSave,
      testId: 'toolbar-save-draft-action',
    },
    {
      id: 'preview',
      label: 'Preview page',
      icon: EyeSolidIcon,
      disabled: !site,
      onSelect: () => openPreview(),
      testId: 'toolbar-preview-action',
    },
    {
      id: 'open-live',
      label: 'Open live page',
      icon: ExternalLinkSolidIcon,
      disabled: !activePage,
      onSelect: () => {
        if (!activePage) return
        window.open(pagePublicPath(activePage.slug), '_blank', 'noopener,noreferrer')
      },
      testId: 'toolbar-open-page-new-tab-action',
    },
  ]

  return (
    <PublishActionGroup
      statusLabel={state === 'published' ? null : status.label}
      statusTone={status.tone}
      statusAriaLabel={status.ariaLabel}
      publishLabel={label}
      publishAriaLabel={state === 'published' ? 'Published' : 'Publish site'}
      publishTitle={state === 'published' ? 'Published' : 'Publish site'}
      publishState={state === 'publishing' ? 'busy' : state === 'published' ? 'success' : state}
      publishBusy={isPublishing}
      publishDisabled={disabled || state === 'published'}
      publishIcon={PublishIcon}
      onPublish={handlePublish}
      menuItems={menuItems}
      toast={message ? {
        tone: state === 'error' ? 'alert' : 'status',
        message,
      } : null}
    />
  )
}
