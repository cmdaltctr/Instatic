import { useLayoutEffect, useRef } from 'react'
import { Button } from '@ui/components/Button'
import { Textarea } from '@ui/components/Input'
import { cn } from '@ui/cn'
import { FilePlusIcon } from '@ui/icons/icons/file-plus'
import { createParagraphBlock } from '@core/content/markdown'
import { contentCollectionHasField } from '@core/content/fields'
import type { ContentBlock, ContentCollection, ContentEntry } from '@core/content/types'
import { CanvasNotch, type CanvasNotchAction } from '@editor/components/Canvas/CanvasNotch'
import canvasStyles from '@editor/components/Canvas/CanvasRoot.module.css'
import { RichMarkdownEditor } from '../../RichMarkdownEditor'
import styles from '../../ContentPage.module.css'

interface ContentDocumentCanvasProps {
  selectedEntry: ContentEntry | null
  selectedCollection: ContentCollection | null
  loading: boolean
  title: string
  titleId: string
  blocks: ContentBlock[]
  notchActions: CanvasNotchAction[]
  onTitleChange: (value: string) => void
  onBlocksChange: (blocks: ContentBlock[]) => void
  onRequestMedia: (blockId: string) => void
  onCreateEntry: () => void
}

export function ContentDocumentCanvas({
  selectedEntry,
  selectedCollection,
  loading,
  title,
  titleId,
  blocks,
  notchActions,
  onTitleChange,
  onBlocksChange,
  onRequestMedia,
  onCreateEntry,
}: ContentDocumentCanvasProps) {
  const titleFieldRef = useRef<HTMLTextAreaElement | null>(null)
  const bodyEnabled = contentCollectionHasField(selectedCollection, 'body')
  const singularLabel = selectedCollection?.singularLabel.toLowerCase() ?? 'entry'

  useLayoutEffect(() => {
    resizeTitleField(titleFieldRef.current)
  }, [title])

  const addControl = bodyEnabled ? (
    <Button
      variant="primary"
      size="sm"
      className={styles.notchAddButton}
      disabled={loading || !selectedEntry}
      onClick={() => onBlocksChange([...blocks, createParagraphBlock()])}
    >
      <FilePlusIcon size={14} aria-hidden="true" />
      <span>Add</span>
    </Button>
  ) : null

  return (
    <div
      role="region"
      aria-label="Content canvas"
      data-testid="content-canvas-root"
      className={cn(canvasStyles.canvas, styles.contentCanvas)}
    >
      {bodyEnabled && <CanvasNotch actions={notchActions} addControl={addControl} />}

      <div className={styles.documentScroll}>
        {loading ? (
          <ContentCanvasLoading />
        ) : selectedEntry ? (
          <article className={styles.document}>
            <label className={styles.titleLabel} htmlFor={titleId}>Title</label>
            <Textarea
              ref={titleFieldRef}
              id={titleId}
              value={title}
              rows={1}
              resize="none"
              onChange={(event) => {
                resizeTitleField(event.currentTarget)
                onTitleChange(event.target.value)
              }}
              className={styles.titleInput}
              fieldSize="md"
              emphasis="strong"
            />
            {bodyEnabled && (
              <RichMarkdownEditor blocks={blocks} onChange={onBlocksChange} onMediaRequest={onRequestMedia} />
            )}
          </article>
        ) : (
          <div className={styles.emptyState}>
            <h2>Create the first {singularLabel}</h2>
            <p>Select a collection and create an entry to start writing.</p>
            <Button variant="primary" size="md" onClick={onCreateEntry} disabled={!selectedCollection}>
              <FilePlusIcon size={15} aria-hidden="true" />
              <span>New {selectedCollection?.singularLabel ?? 'Entry'}</span>
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function resizeTitleField(node: HTMLTextAreaElement | null) {
  if (!node) return
  node.style.height = 'auto'
  if (node.scrollHeight > 0) {
    node.style.height = `${node.scrollHeight}px`
  }
}

function ContentCanvasLoading() {
  return (
    <div
      className={styles.canvasLoading}
      data-testid="content-canvas-loading"
      aria-busy="true"
      aria-label="Loading content"
    >
      <span className={cn(styles.skeletonShape, styles.canvasSkeletonTitle)} />
      <span className={cn(styles.skeletonShape, styles.canvasSkeletonLine)} />
      <span className={cn(styles.skeletonShape, styles.canvasSkeletonShortLine)} />
      <span className={cn(styles.skeletonShape, styles.canvasSkeletonBlock)} />
    </div>
  )
}
