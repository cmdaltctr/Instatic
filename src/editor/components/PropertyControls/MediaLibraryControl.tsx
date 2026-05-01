import { useEffect, useMemo, useState } from 'react'
import { listCmsMediaAssets, type CmsMediaAsset } from '../../../core/persistence/cmsMedia'
import { isValidImageUrl } from '../../../core/utils/urlValidation'
import type { ControlProps } from './shared'
import { Button } from '@ui/components/Button'
import { Input } from '@ui/components/Input'
import { SearchBar } from '@ui/components/SearchBar'
import { VideoIcon } from '@ui/icons/icons/video'
import { cn } from '@ui/cn'
import styles from './controls.module.css'

type MediaKind = 'image' | 'video'
type MediaMode = 'library' | 'url'

interface MediaLibraryControlProps extends ControlProps<string> {
  mediaKind: MediaKind
}

const IMAGE_EXTENSIONS = /\.(avif|gif|jpe?g|png|svg|webp)$/i
const VIDEO_EXTENSIONS = /\.(m4v|mov|mp4|og[gv]|webm)$/i

interface MediaPickerAsset extends CmsMediaAsset {
  previewPath: string
}

function assetMatchesKind(asset: CmsMediaAsset, mediaKind: MediaKind): boolean {
  if (asset.mimeType.startsWith(`${mediaKind}/`)) return true
  const target = `${asset.filename} ${asset.publicPath}`
  return mediaKind === 'image' ? IMAGE_EXTENSIONS.test(target) : VIDEO_EXTENSIONS.test(target)
}

function isLocalMediaPath(value: string): boolean {
  if (!value.startsWith('/') || value.startsWith('//')) return false
  for (const char of value) {
    const code = char.charCodeAt(0)
    if (char === '\\' || code <= 31) return false
  }
  return true
}

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

function isValidMediaUrl(value: string, mediaKind: MediaKind): boolean {
  if (!value) return true
  if (isLocalMediaPath(value)) return true
  if (mediaKind === 'image') return isValidImageUrl(value)
  return isHttpUrl(value)
}

function startsInUrlMode(value: string): boolean {
  return Boolean(value) && !value.startsWith('/uploads/')
}

function formatBytes(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return ''
  if (sizeBytes < 1024) return `${sizeBytes} B`
  if (sizeBytes < 1024 * 1024) return `${Math.round(sizeBytes / 102.4) / 10} KB`
  return `${Math.round(sizeBytes / 1024 / 102.4) / 10} MB`
}

export function MediaLibraryControl({
  propKey,
  value,
  onChange,
  label,
  isOverride,
  disabled,
  mediaKind,
}: MediaLibraryControlProps) {
  const currentValue = String(value ?? '')
  const [mode, setMode] = useState<MediaMode>(() => startsInUrlMode(currentValue) ? 'url' : 'library')
  const [cmsAssets, setCmsAssets] = useState<CmsMediaAsset[]>([])
  const [cmsLoading, setCmsLoading] = useState(true)
  const [libraryError, setLibraryError] = useState('')
  const [query, setQuery] = useState('')
  const [urlDraftState, setUrlDraftState] = useState(() => ({
    sourceValue: currentValue,
    draft: currentValue,
  }))

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) {
        setCmsLoading(true)
        setLibraryError('')
      }
    })

    listCmsMediaAssets()
      .then((nextAssets) => {
        if (!cancelled) setCmsAssets(nextAssets)
      })
      .catch((err) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Unable to load media library'
          setLibraryError(message === 'Unauthorized' ? 'Sign in again to use CMS media.' : message)
        }
      })
      .finally(() => {
        if (!cancelled) setCmsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const assets = useMemo<MediaPickerAsset[]>(() => {
    return cmsAssets.map((asset) => ({ ...asset, previewPath: asset.publicPath }))
  }, [cmsAssets])

  const mediaAssets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return assets
      .filter((asset) => assetMatchesKind(asset, mediaKind))
      .filter((asset) => {
        if (!normalizedQuery) return true
        return `${asset.filename} ${asset.mimeType} ${asset.publicPath}`
          .toLowerCase()
          .includes(normalizedQuery)
      })
  }, [assets, mediaKind, query])

  const modeLabel = mediaKind === 'image' ? 'image' : 'video'
  const loading = cmsLoading
  const activeLibraryError = libraryError
  const validCurrentValue = isValidMediaUrl(currentValue, mediaKind)
  const currentAsset = mediaAssets.find((asset) => asset.publicPath === currentValue)
  const showUrlPreview = validCurrentValue && currentValue
  const urlDraft = urlDraftState.sourceValue === currentValue ? urlDraftState.draft : currentValue
  const urlError = !isValidMediaUrl(urlDraft, mediaKind)

  function handleUrlChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextValue = event.target.value
    const valid = isValidMediaUrl(nextValue, mediaKind)
    setUrlDraftState({ sourceValue: currentValue, draft: nextValue })
    if (valid) onChange(propKey, nextValue)
  }

  function selectAsset(asset: CmsMediaAsset) {
    onChange(propKey, asset.publicPath)
  }

  return (
    <div className={cn(styles.controlWrapper, disabled && styles.controlWrapperDisabled)}>
      <div className={styles.labelRow}>
        <label
          htmlFor={mode === 'url' ? `ctrl-${propKey}` : undefined}
          className={isOverride ? styles.labelOverride : undefined}
        >
          {label ?? propKey}
        </label>
        {mode === 'url' && urlError && (
          <span className={styles.labelError} role="alert">
            Invalid {modeLabel} URL
          </span>
        )}
      </div>

      <div className={styles.mediaPicker}>
        <div className={styles.mediaSourceSwitch} role="group" aria-label={`${label ?? propKey} source`}>
          <Button
            variant="secondary"
            size="xs"
            fullWidth
            pressed={mode === 'library'}
            active={mode === 'library'}
            disabled={disabled}
            onClick={() => setMode('library')}
            aria-label="Media library"
          >
            Library
          </Button>
          <Button
            variant="secondary"
            size="xs"
            fullWidth
            pressed={mode === 'url'}
            active={mode === 'url'}
            disabled={disabled}
            onClick={() => setMode('url')}
            aria-label="Custom URL"
          >
            URL
          </Button>
        </div>

        {mode === 'library' ? (
          <div className={styles.mediaLibraryBody}>
            <SearchBar
              value={query}
              onValueChange={setQuery}
              fieldSize="xs"
              placeholder={`Search ${modeLabel}s`}
              aria-label={`Search ${modeLabel} media`}
              disabled={disabled}
              className={styles.mediaSearch}
            />

            {loading ? (
              <div className={styles.mediaStatus}>Loading media...</div>
            ) : activeLibraryError ? (
              <div className={styles.mediaStatus} role="alert">
                {activeLibraryError}
              </div>
            ) : mediaAssets.length === 0 ? (
              <div className={styles.mediaStatus}>
                {query ? `No matching ${modeLabel}s` : `No ${modeLabel} assets yet`}
              </div>
            ) : (
              <div className={styles.mediaAssetList}>
                {mediaAssets.map((asset) => {
                  const selected = asset.publicPath === currentValue
                  const meta = [asset.mimeType, formatBytes(asset.sizeBytes)].filter(Boolean).join(' · ')
                  return (
                    <Button
                      key={asset.id}
                      variant="ghost"
                      size="sm"
                      align="start"
                      fullWidth
                      active={selected}
                      disabled={disabled}
                      onClick={() => selectAsset(asset)}
                      className={styles.mediaAssetButton}
                      aria-label={`Select media ${asset.filename}`}
                    >
                      <span className={styles.mediaAssetButtonContent}>
                        <span className={styles.mediaThumb} aria-hidden="true">
                          {mediaKind === 'image' ? (
                            <img src={asset.previewPath} alt="" />
                          ) : (
                            <VideoIcon size={16} />
                          )}
                        </span>
                        <span className={styles.mediaAssetText}>
                          <span className={styles.mediaAssetName}>{asset.filename}</span>
                          {meta && <span className={styles.mediaAssetMeta}>{meta}</span>}
                        </span>
                      </span>
                    </Button>
                  )
                })}
              </div>
            )}

            {currentAsset && (
              <div className={styles.mediaSelectedPath} title={currentAsset.publicPath}>
                {currentAsset.publicPath}
              </div>
            )}
          </div>
        ) : (
          <div className={styles.mediaUrlBody}>
            {showUrlPreview && mediaKind === 'image' && (
              <div className={styles.imagePreview}>
                <img
                  src={currentValue}
                  alt="preview"
                  className={styles.imagePreviewImg}
                  onError={(event) => {
                    ;(event.target as HTMLImageElement).style.display = 'none'
                  }}
                />
              </div>
            )}
            {showUrlPreview && mediaKind === 'video' && (
              <div className={styles.videoPreview} aria-hidden="true">
                <VideoIcon size={16} />
                <span>{currentValue}</span>
              </div>
            )}
            <Input
              id={`ctrl-${propKey}`}
              type="url"
              value={urlDraft}
              placeholder={mediaKind === 'image' ? 'https://example.com/image.png' : 'https://example.com/video.mp4'}
              disabled={disabled}
              onChange={handleUrlChange}
              invalid={urlError}
            />
          </div>
        )}
      </div>
    </div>
  )
}
