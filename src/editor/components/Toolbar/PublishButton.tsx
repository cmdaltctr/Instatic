import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditorStore } from '@core/editor-store/store'
import { getCmsPublishStatus, publishCmsDraft } from '@core/persistence'
import { Icon } from '../../../ui/icons/Icon'
import { Button } from '@ui/components/Button'
import styles from './Toolbar.module.css'

type PublishState = 'idle' | 'publishing' | 'published' | 'error'

interface PublishButtonProps {
  enabled?: boolean
  onSave?: () => void | Promise<void>
}

export function PublishButton({ enabled = true, onSave }: PublishButtonProps) {
  const project = useEditorStore((s) => s.project)
  const hasUnsavedChanges = useEditorStore((s) => s.hasUnsavedChanges)
  const [state, setState] = useState<PublishState>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!enabled || !project) return
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
  }, [enabled, project?.id])

  useEffect(() => {
    if (!hasUnsavedChanges || state !== 'published') return
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current)
    statusTimerRef.current = null
    setState('idle')
    setMessage(null)
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
    if (!project || !enabled || state === 'publishing') return

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
  }, [clearMessageLater, enabled, onSave, project, resetErrorLater, state])

  const isPublishing = state === 'publishing'
  const disabled = !project || !enabled || isPublishing
  const label =
    isPublishing ? 'Publishing' :
    state === 'published' ? 'Published' :
    state === 'error' ? 'Publish failed' :
    'Publish'

  return (
    <div className={styles.publishWrapper}>
      <Button
        variant={state === 'error' ? 'destructive' : 'primary'}
        size="sm"
        aria-label="Publish site"
        aria-busy={isPublishing}
        title="Publish site"
        onClick={handlePublish}
        disabled={disabled}
        data-testid="toolbar-publish-btn"
      >
        {isPublishing ? (
          <Icon name="loader" size={13} className={styles.spinIcon} aria-hidden="true" />
        ) : state === 'published' ? (
          <Icon name="check" size={13} aria-hidden="true" />
        ) : state === 'error' ? (
          <Icon name="circle-alert" size={13} aria-hidden="true" />
        ) : (
          <Icon name="cloud-upload" size={13} aria-hidden="true" />
        )}
        <span>{label}</span>
      </Button>

      {state === 'error' && message && (
        <div role="alert" className={styles.publishToast}>
          {message}
        </div>
      )}

      {state === 'published' && message && (
        <div role="status" className={styles.publishToast}>
          {message}
        </div>
      )}
    </div>
  )
}
