import { CheckIcon } from 'pixel-art-icons/icons/check'
import { CircleAlertIcon } from 'pixel-art-icons/icons/circle-alert'
import { ExternalLinkIcon } from 'pixel-art-icons/icons/external-link'
import { LoaderIcon } from 'pixel-art-icons/icons/loader'
import { SaveIcon } from 'pixel-art-icons/icons/save'
import { SendIcon } from 'pixel-art-icons/icons/send'
import type { ContentCollection, ContentEntry } from '@core/content/schemas'
import {
  PublishActionGroup,
  type PublishActionMenuItem,
  type PublishActionStatusTone,
} from '@editor/components/Toolbar/PublishActionGroup'
import { SettingsButton } from '@editor/components/Toolbar/SettingsButton'
import type { SaveMessage } from '../../hooks/useContentEntryDraft'

interface ContentToolbarProps {
  contentLoading: boolean
  saveMessage: SaveMessage
  isDirty: boolean
  selectedEntry: ContentEntry | null
  selectedCollection: ContentCollection | null
  publicPath: string
  canSaveDraft: boolean
  canPublish: boolean
  onSaveDraft: () => void
  onPublish: () => void
}

export function ContentToolbar({
  contentLoading,
  saveMessage,
  isDirty,
  selectedEntry,
  selectedCollection,
  publicPath,
  canSaveDraft,
  canPublish,
  onSaveDraft,
  onPublish,
}: ContentToolbarProps) {
  const entryLabel = (selectedCollection?.singularLabel ?? 'entry').toLowerCase()
  const openEntryLabel = `Open live ${entryLabel}`
  const isCleanPublished = Boolean(
    selectedEntry?.status === 'published' &&
    !isDirty &&
    saveMessage !== 'saving' &&
    saveMessage !== 'publishing' &&
    saveMessage !== 'error',
  )
  const statusText =
    contentLoading ? 'Loading content' :
    saveMessage === 'publishing' ? 'Publishing' :
    saveMessage === 'saving' ? 'Saving draft' :
    saveMessage === 'error' ? 'Save failed' :
    isDirty ? 'Unsaved draft' :
    saveMessage === 'saved' ? 'Draft saved' :
    isCleanPublished ? 'Published' :
    selectedEntry?.status === 'unpublished' ? 'Unpublished' :
    selectedEntry ? 'Draft' :
    'No entry selected'
  const statusTone: PublishActionStatusTone =
    saveMessage === 'error' ? 'danger' :
    isDirty ? 'warning' :
    saveMessage === 'saved' || isCleanPublished ? 'success' :
    saveMessage === 'saving' || saveMessage === 'publishing' ? 'neutral' :
    'neutral'
  const isSaving = saveMessage === 'saving'
  const isPublishing = saveMessage === 'publishing'
  const publishLabel =
    isPublishing ? 'Publishing' :
    isCleanPublished ? 'Published' :
    saveMessage === 'error' ? 'Retry publish' :
    'Publish'
  const PublishIcon =
    isPublishing ? LoaderIcon :
    isCleanPublished ? CheckIcon :
    saveMessage === 'error' ? CircleAlertIcon :
    SendIcon
  const menuItems: PublishActionMenuItem[] = [
    {
      id: 'save-draft',
      label: 'Save draft',
      icon: SaveIcon,
      disabled: !selectedEntry || !canSaveDraft || isSaving || !isDirty,
      onSelect: onSaveDraft,
      testId: 'toolbar-content-save-draft-action',
    },
    {
      id: 'open-live',
      label: openEntryLabel,
      icon: ExternalLinkIcon,
      disabled: !publicPath,
      onSelect: () => {
        if (!publicPath) return
        window.open(publicPath, '_blank', 'noopener,noreferrer')
      },
      testId: 'toolbar-content-open-entry-action',
    },
  ]

  return (
    <>
      <PublishActionGroup
        statusLabel={isCleanPublished ? null : statusText}
        statusTone={statusTone}
        publishLabel={publishLabel}
        publishAriaLabel={isCleanPublished ? 'Published' : `Publish ${entryLabel}`}
        publishTitle={isCleanPublished ? 'Published' : `Publish ${entryLabel}`}
        publishState={isPublishing ? 'busy' : saveMessage === 'error' ? 'error' : isCleanPublished ? 'success' : 'idle'}
        publishBusy={isPublishing}
        publishDisabled={!selectedEntry || !canPublish || isPublishing || isCleanPublished}
        publishIcon={PublishIcon}
        onPublish={onPublish}
        menuItems={menuItems}
      />
      <SettingsButton />
    </>
  )
}
