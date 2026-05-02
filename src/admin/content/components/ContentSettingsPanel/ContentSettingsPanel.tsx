import { Button } from '@ui/components/Button'
import { Input, Textarea } from '@ui/components/Input'
import { Select } from '@ui/components/Select'
import { cn } from '@ui/cn'
import { Settings2Icon } from '@ui/icons/icons/settings-2'
import { VideoIcon } from '@ui/icons/icons/video'
import type { CmsMediaAsset } from '@core/persistence'
import { useEditorStore } from '@core/editor-store/store'
import { contentCollectionHasField } from '@core/content/fields'
import type { ContentCollection, ContentEntry, ContentEntryStatus } from '@core/content/types'
import propertiesStyles from '@editor/components/PropertiesPanel/PropertiesPanel.module.css'
import { PanelHeader } from '@editor/components/shared/PanelHeader'
import styles from '../../ContentPage.module.css'

interface ContentSettingsPanelProps {
  selectedEntry: ContentEntry | null
  collections: ContentCollection[]
  selectedCollection: ContentCollection | null
  loading: boolean
  slug: string
  slugId: string
  seoTitle: string
  seoTitleId: string
  seoDescription: string
  seoDescriptionId: string
  publicPath: string
  mediaAssets: CmsMediaAsset[]
  mediaLoading: boolean
  mediaError: string | null
  featuredMediaId: string | null
  featuredMediaAsset: CmsMediaAsset | null
  onCollectionChange: (collectionId: string) => void
  onSlugChange: (value: string) => void
  onSeoTitleChange: (value: string) => void
  onSeoDescriptionChange: (value: string) => void
  onStatusChange: (status: ContentEntryStatus) => void
  onChooseFeaturedMedia: () => void
  onClearFeaturedMedia: () => void
}

export function ContentSettingsPanel({
  selectedEntry,
  collections,
  selectedCollection,
  loading,
  slug,
  slugId,
  seoTitle,
  seoTitleId,
  seoDescription,
  seoDescriptionId,
  publicPath,
  mediaAssets,
  mediaLoading,
  mediaError,
  featuredMediaId,
  featuredMediaAsset,
  onCollectionChange,
  onSlugChange,
  onSeoTitleChange,
  onSeoDescriptionChange,
  onStatusChange,
  onChooseFeaturedMedia,
  onClearFeaturedMedia,
}: ContentSettingsPanelProps) {
  const setPropertiesPanel = useEditorStore((s) => s.setPropertiesPanel)
  const seoEnabled = contentCollectionHasField(selectedCollection, 'seo')
  const featuredMediaEnabled = contentCollectionHasField(selectedCollection, 'featuredMedia')

  return (
    <aside
      data-panel=""
      data-testid="content-settings-panel"
      role="complementary"
      aria-label="Content settings"
      className={cn(propertiesStyles.panel, propertiesStyles.panelDocked)}
    >
      <PanelHeader
        panelId="content-settings"
        title="Settings"
        titleContent={(
          <span className={propertiesStyles.headerNodeTitle}>
            <Settings2Icon size={13} aria-hidden="true" />
            <span className={propertiesStyles.headerNodeLabel}>Settings</span>
          </span>
        )}
        onClose={() => setPropertiesPanel({ collapsed: true })}
      />

      <div className={styles.settingsBody}>
        {loading ? (
          <ContentSettingsLoading />
        ) : (
          <>
            <div className={styles.field}>
              <span>Collection</span>
              <Select
                aria-label="Collection"
                value={selectedEntry?.collectionId ?? selectedCollection?.id ?? ''}
                disabled={!selectedEntry}
                onChange={(event) => onCollectionChange(event.target.value)}
                options={collections.map((collection) => ({
                  value: collection.id,
                  label: collection.pluralLabel || collection.name,
                }))}
              />
            </div>
            <label className={styles.field} htmlFor={slugId}>
              <span>Slug</span>
              <Input
                id={slugId}
                value={slug}
                onChange={(event) => onSlugChange(event.target.value)}
                disabled={!selectedEntry}
              />
            </label>
            {seoEnabled && (
              <>
                <label className={styles.field} htmlFor={seoTitleId}>
                  <span>SEO title</span>
                  <Input
                    id={seoTitleId}
                    value={seoTitle}
                    onChange={(event) => onSeoTitleChange(event.target.value)}
                    disabled={!selectedEntry}
                  />
                </label>
                <label className={styles.field} htmlFor={seoDescriptionId}>
                  <span>SEO description</span>
                  <Textarea
                    id={seoDescriptionId}
                    value={seoDescription}
                    onChange={(event) => onSeoDescriptionChange(event.target.value)}
                    disabled={!selectedEntry}
                    resize="none"
                    rows={4}
                  />
                </label>
              </>
            )}
            <div className={styles.field}>
              <span>Status</span>
              <Select
                aria-label="Status"
                value={selectedEntry?.status ?? 'draft'}
                disabled={!selectedEntry}
                onChange={(event) => onStatusChange(event.target.value as ContentEntryStatus)}
                options={[
                  { value: 'draft', label: 'Draft' },
                  { value: 'published', label: 'Published' },
                  { value: 'unpublished', label: 'Unpublished' },
                ]}
              />
            </div>
            <div className={styles.metaBlock}>
              <span>Public URL</span>
              <strong>{publicPath || 'Not available'}</strong>
            </div>
            {featuredMediaEnabled && (
              <div className={styles.featuredMediaField}>
                <span>Featured media</span>
                {featuredMediaAsset ? (
                  <div className={styles.featuredMediaCard}>
                    <span className={styles.featuredMediaPreview} aria-hidden="true">
                      {featuredMediaAsset.mimeType.startsWith('image/') ? (
                        <img src={featuredMediaAsset.publicPath} alt="" />
                      ) : (
                        <VideoIcon size={16} />
                      )}
                    </span>
                    <span className={styles.featuredMediaText}>
                      <strong>{featuredMediaAsset.filename}</strong>
                      <small>{featuredMediaAsset.publicPath}</small>
                    </span>
                  </div>
                ) : (
                  <strong>{featuredMediaId ?? 'None'}</strong>
                )}
                {mediaError && <p className={styles.error} role="alert">{mediaError}</p>}
                <div className={styles.featuredMediaActions}>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!selectedEntry || mediaLoading}
                    onClick={onChooseFeaturedMedia}
                  >
                    {mediaLoading ? 'Loading media' : 'Choose featured media'}
                  </Button>
                  {featuredMediaId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!selectedEntry}
                      onClick={onClearFeaturedMedia}
                    >
                      Clear
                    </Button>
                  )}
                </div>
                {mediaAssets.length > 0 && !featuredMediaAsset && featuredMediaId && (
                  <small className={styles.muted}>Selected media is not in the current library results.</small>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  )
}

function ContentSettingsLoading() {
  return (
    <div
      className={styles.settingsSkeleton}
      data-testid="content-settings-loading"
      aria-busy="true"
      aria-label="Loading content settings"
    >
      <span className={cn(styles.skeletonShape, styles.settingsSkeletonLabel)} />
      <span className={cn(styles.skeletonShape, styles.settingsSkeletonInput)} />
      <span className={cn(styles.skeletonShape, styles.settingsSkeletonLabel)} />
      <span className={cn(styles.skeletonShape, styles.settingsSkeletonInput)} />
      <span className={cn(styles.skeletonShape, styles.settingsSkeletonLabel)} />
      <span className={cn(styles.skeletonShape, styles.settingsSkeletonTextarea)} />
      <span className={cn(styles.skeletonShape, styles.settingsSkeletonCard)} />
    </div>
  )
}
