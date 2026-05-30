import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { useEditorStore } from '@site/store/store'
import { checkSizeLimit } from '@core/files/upload'
import {
  deleteCmsMediaAsset,
  listCmsMediaAssets,
  renameCmsMediaAsset,
  uploadCmsMediaAsset,
  type CmsMediaAsset,
} from '@core/persistence/cmsMedia'
import { Panel, useAutoFocusPanel } from '@admin/shared/Panel'
import { Button } from '@ui/components/Button'
import { EmptyState } from '@ui/components/EmptyState'
import { FileUpload } from '@ui/components/FileUpload'
import { FilterBar, type FilterBarItem } from '@ui/components/FilterBar'
import { Image } from '@ui/components/Image'
import { Skeleton } from '@ui/components/Skeleton'
import type { IconComponent } from 'pixel-art-icons/types'
import { BulletlistSolidIcon } from 'pixel-art-icons/icons/bulletlist-solid'
import { CheckIcon } from 'pixel-art-icons/icons/check'
import { Copy2SolidIcon } from 'pixel-art-icons/icons/copy-2-solid'
import { FolderGlyphIcon } from 'pixel-art-icons/icons/folder-glyph'
import { Grid2x22SolidIcon } from 'pixel-art-icons/icons/grid-2x2-2-solid'
import { Image2SolidIcon } from 'pixel-art-icons/icons/image-2-solid'
import { UploadIcon } from 'pixel-art-icons/icons/upload'
import { VideoSolidIcon } from 'pixel-art-icons/icons/video-solid'
import { cn } from '@ui/cn'
import {
  ExplorerItemContextMenu,
  ExplorerRenameDialog,
  type ExplorerContextMenuItem,
  type ExplorerRenamePayload,
} from '@site/explorer-actions'
import { MediaViewerWindow } from '@admin/pages/media/components/MediaViewerWindow/MediaViewerWindow'
import { useStandaloneMediaEditor } from '@admin/pages/media/hooks/useStandaloneMediaEditor'
import styles from '../SiteExplorerPanel/SiteExplorerPanel.module.css'

interface MediaExplorerPanelProps {
  variant?: 'docked'
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

type MediaBucket = 'images' | 'videos' | 'other'
type MediaFilter = 'all' | MediaBucket
type MediaViewMode = 'list' | 'grid'

interface ContextMenuState {
  x: number
  y: number
  target: CmsMediaAsset
}

const BUCKET_LABELS: Record<MediaBucket, string> = {
  images: 'Images',
  videos: 'Videos',
  other: 'Other',
}

const VIEW_MODE_STORAGE_KEY = 'pb-media-explorer-view-mode'

function readStoredViewMode(): MediaViewMode {
  try {
    const raw = globalThis.localStorage?.getItem(VIEW_MODE_STORAGE_KEY)
    return raw === 'grid' || raw === 'list' ? raw : 'list'
  } catch {
    return 'list'
  }
}

function writeStoredViewMode(mode: MediaViewMode) {
  try {
    globalThis.localStorage?.setItem(VIEW_MODE_STORAGE_KEY, mode)
  } catch {
    // best-effort UI persistence
  }
}

const IMAGE_EXTENSIONS = new Set([
  'apng',
  'avif',
  'gif',
  'jpeg',
  'jpg',
  'png',
  'svg',
  'webp',
])

const VIDEO_EXTENSIONS = new Set([
  'avi',
  'm4v',
  'mov',
  'mp4',
  'mpeg',
  'ogv',
  'webm',
])

function fileName(path: string) {
  return path.split('/').pop() ?? path
}

function keyboardMenuPosition(element: HTMLElement) {
  const rect = element.getBoundingClientRect()
  return {
    x: rect.left + Math.min(rect.width - 8, 24),
    y: rect.top + Math.min(rect.height - 8, 24),
  }
}

function extension(path: string) {
  const name = fileName(path)
  const index = name.lastIndexOf('.')
  return index >= 0 ? name.slice(index + 1).toLowerCase() : ''
}

function mediaBucket(mimeType: string | undefined, path: string): MediaBucket {
  if (mimeType?.startsWith('image/')) return 'images'
  if (mimeType?.startsWith('video/')) return 'videos'

  const ext = extension(path)
  if (IMAGE_EXTENSIONS.has(ext)) return 'images'
  if (VIDEO_EXTENSIONS.has(ext)) return 'videos'
  return 'other'
}

function groupCmsMediaAssets(assets: CmsMediaAsset[]) {
  const buckets: Record<MediaBucket, CmsMediaAsset[]> = {
    images: [],
    videos: [],
    other: [],
  }

  for (const asset of assets) {
    buckets[mediaBucket(asset.mimeType, asset.filename)].push(asset)
  }

  return buckets
}

function searchableText(...parts: Array<string | undefined>) {
  return parts.filter(Boolean).join(' ').toLowerCase()
}

function matchesSearch(query: string, ...parts: Array<string | undefined>) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true
  return searchableText(...parts).includes(normalized)
}

function filterCmsMediaBuckets(
  buckets: Record<MediaBucket, CmsMediaAsset[]>,
  filter: MediaFilter,
  query: string,
) {
  const next: Record<MediaBucket, CmsMediaAsset[]> = {
    images: [],
    videos: [],
    other: [],
  }

  for (const bucket of Object.keys(next) as MediaBucket[]) {
    if (filter !== 'all' && filter !== bucket) continue
    next[bucket] = buckets[bucket].filter((asset) => matchesSearch(query, asset.filename, asset.publicPath, asset.mimeType))
  }

  return next
}

function targetBucket(target: CmsMediaAsset) {
  return mediaBucket(target.mimeType, target.filename)
}

export function MediaExplorerPanel({
  variant = 'docked',
  open,
  onOpenChange,
}: MediaExplorerPanelProps) {
  const storeOpen = useEditorStore((s) => s.mediaExplorerPanelOpen)
  const isOpen = open ?? storeOpen
  const site = useEditorStore((s) => s.site)
  const setMediaExplorerPanelOpen = useEditorStore((s) => s.setMediaExplorerPanelOpen)
  const updateNodeProps = useEditorStore((s) => s.updateNodeProps)
  const activePageId = useEditorStore((s) => s.activePageId)
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId)
  const [cmsAssets, setCmsAssets] = useState<CmsMediaAsset[]>([])
  // Single-asset viewer state. Replaces the old `openMediaAssetPreview`
  // store action which routed previews into the CodeEditorPanel. The new
  // viewer is the same MediaViewerWindow the Media page uses, so editing
  // (alt text, caption, tags, replace file, …) works identically here.
  const [viewerAssetId, setViewerAssetId] = useState<string | null>(null)
  const viewerAsset =
    cmsAssets.find((asset) => asset.id === viewerAssetId) ?? null
  const viewerEditor = useStandaloneMediaEditor({
    asset: viewerAsset,
    assets: cmsAssets,
    onAssetChanged: (asset) =>
      setCmsAssets((current) => current.map((item) => item.id === asset.id ? asset : item)),
    onAssetRemoved: (id) =>
      setCmsAssets((current) => current.filter((item) => item.id !== id)),
  })
  const openMediaAssetPreview = (asset: CmsMediaAsset) => {
    setViewerAssetId(asset.id)
  }
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [renameTarget, setRenameTarget] = useState<CmsMediaAsset | null>(null)
  const [mediaError, setMediaError] = useState<string | null>(null)
  const [mediaLoading, setMediaLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all')
  const [viewMode, setViewModeState] = useState<MediaViewMode>(readStoredViewMode)
  const setViewMode = (mode: MediaViewMode) => {
    setViewModeState(mode)
    writeStoredViewMode(mode)
  }
  const panelRef = useRef<HTMLElement>(null)

  const cmsBuckets = groupCmsMediaAssets(cmsAssets)
  const visibleCmsBuckets = filterCmsMediaBuckets(
    cmsBuckets,
    mediaFilter,
    searchQuery,
  )
  const counts = visibleCmsBuckets
  const hasFilters = searchQuery.trim().length > 0 || mediaFilter !== 'all'
  const emptyLabel = mediaError ?? (hasFilters ? 'No matching media' : 'None yet')
  const selectedNode = (() => {
    if (!site || !activePageId || !selectedNodeId) return null
    const activePage = site.pages.find((page) => page.id === activePageId)
    return activePage?.nodes[selectedNodeId] ?? null
  })()

  function closePanel() {
    if (onOpenChange) {
      onOpenChange(false)
      return
    }
    setMediaExplorerPanelOpen(false)
  }

  useAutoFocusPanel(panelRef, isOpen)

  useEffect(() => {
    if (!isOpen) return

    let canceled = false
    queueMicrotask(() => {
      if (!canceled) {
        setMediaLoading(true)
        setMediaError(null)
      }
    })
    listCmsMediaAssets()
      .then((assets) => {
        if (!canceled) setCmsAssets(assets)
      })
      .catch((err) => {
        if (!canceled) {
          setMediaError(err instanceof Error ? err.message : 'Unable to load media')
        }
      })
      .finally(() => {
        if (!canceled) setMediaLoading(false)
      })

    return () => {
      canceled = true
    }
  }, [isOpen])

  if (!isOpen || variant !== 'docked') return null

  async function handleAssetUpload(e: ChangeEvent<HTMLInputElement>) {
    const pickedFiles = Array.from(e.target.files ?? [])
    e.target.value = ''

    for (const file of pickedFiles) {
      const sizeCheck = checkSizeLimit(file.size)
      if (!sizeCheck.ok) {
        console.warn('[MediaExplorerPanel] Upload rejected:', sizeCheck.message)
        continue
      }

      try {
        const asset = await uploadCmsMediaAsset(file)
        setCmsAssets((assets) => [asset, ...assets.filter((item) => item.id !== asset.id)])
      } catch (err) {
        console.error('[MediaExplorerPanel] upload asset error:', err)
      }
    }
  }

  function renderUploadAction() {
    return (
      <FileUpload
        multiple
        onChange={handleAssetUpload}
        buttonProps={{
          variant: 'ghost',
          size: 'xs',
          iconOnly: true,
          title: 'Upload media',
          'aria-label': 'Upload media',
        }}
      >
        <UploadIcon size={13} />
      </FileUpload>
    )
  }

  function openContextMenu(target: CmsMediaAsset, event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu({ x: event.clientX, y: event.clientY, target })
  }

  function openKeyboardContextMenu(target: CmsMediaAsset, event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return
    event.preventDefault()
    event.stopPropagation()
    setContextMenu({ ...keyboardMenuPosition(event.currentTarget), target })
  }

  async function handleRename(payload: ExplorerRenamePayload) {
    if (!renameTarget) return

    const asset = await renameCmsMediaAsset(renameTarget.id, payload.value)
    setCmsAssets((assets) => assets.map((item) => item.id === asset.id ? asset : item))
    // Viewer reads the asset by id from `cmsAssets`, so the rename surfaces
    // automatically — no separate openMediaAssetPreview re-trigger needed.
    setRenameTarget(null)
  }

  async function handleDelete(target: CmsMediaAsset) {
    setCmsAssets((assets) => assets.filter((item) => item.id !== target.id))
    if (viewerAssetId === target.id) {
      setViewerAssetId(null)
    }
    try {
      await deleteCmsMediaAsset(target.id)
    } catch (err) {
      setCmsAssets((assets) => [target, ...assets.filter((item) => item.id !== target.id)])
      setMediaError(err instanceof Error ? err.message : 'Unable to delete media')
      console.error('[MediaExplorerPanel] delete CMS media error:', err)
    }
    setContextMenu(null)
  }

  function applyTargetToSelectedModule(target: CmsMediaAsset) {
    if (!selectedNodeId || !selectedNode) return

    const publicPath = target.publicPath
    const bucket = targetBucket(target)
    if (selectedNode.moduleId === 'base.image' && bucket === 'images') {
      updateNodeProps(selectedNodeId, { src: publicPath })
    } else if (selectedNode.moduleId === 'base.video' && bucket === 'videos') {
      updateNodeProps(selectedNodeId, { videoUrl: publicPath })
    }
    setContextMenu(null)
  }

  async function copyTargetUrl(target: CmsMediaAsset) {
    setContextMenu(null)
    if (!navigator.clipboard?.writeText) {
      setMediaError('Clipboard is unavailable')
      return
    }

    try {
      await navigator.clipboard.writeText(target.publicPath)
    } catch (err) {
      setMediaError('Unable to copy media URL')
      console.error('[MediaExplorerPanel] copy media URL error:', err)
    }
  }

  function contextMenuItems(target: CmsMediaAsset): ExplorerContextMenuItem[] {
    const items: ExplorerContextMenuItem[] = []
    const bucket = targetBucket(target)

    if (selectedNode?.moduleId === 'base.image' && bucket === 'images') {
      items.push({
        label: 'Use in selected image',
        action: () => applyTargetToSelectedModule(target),
        icon: <CheckIcon size={13} />,
      })
    } else if (selectedNode?.moduleId === 'base.video' && bucket === 'videos') {
      items.push({
        label: 'Use in selected video',
        action: () => applyTargetToSelectedModule(target),
        icon: <CheckIcon size={13} />,
      })
    }

    items.push({
      label: 'Copy URL',
      action: () => { void copyTargetUrl(target) },
      icon: <Copy2SolidIcon size={13} />,
    })

    return items
  }

  function shouldShowBucket(bucket: MediaBucket) {
    return mediaFilter === 'all' || mediaFilter === bucket
  }

  return (
    <>
      <Panel
        ref={panelRef}
        panelId="media-explorer"
        title="Media"
        ariaLabel="Media Explorer"
        testId="media-explorer-panel"
        onClose={closePanel}
      >
        <FilterBar<MediaFilter>
          items={(['all', 'images', 'videos', 'other'] as MediaFilter[]).map<FilterBarItem<MediaFilter>>((filter) => ({
            value: filter,
            label: filter === 'all' ? 'All' : BUCKET_LABELS[filter],
          }))}
          value={mediaFilter}
          onValueChange={setMediaFilter}
          search={{
            value: searchQuery,
            onValueChange: setSearchQuery,
            onClear: () => setSearchQuery(''),
            placeholder: 'Search media',
            ariaLabel: 'Search media',
          }}
          groupLabel="Filter media type"
          trailing={
            <div role="group" aria-label="Media view" className={styles.mediaViewGroup}>
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="xs"
                iconOnly
                pressed={viewMode === 'list'}
                tooltip="List view"
                aria-label="List view"
                onClick={() => setViewMode('list')}
              >
                <BulletlistSolidIcon size={13} />
              </Button>
              <Button
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                size="xs"
                iconOnly
                pressed={viewMode === 'grid'}
                tooltip="Grid view"
                aria-label="Grid view"
                onClick={() => setViewMode('grid')}
              >
                <Grid2x22SolidIcon size={13} />
              </Button>
            </div>
          }
        />

        {shouldShowBucket('images') && (
          <ExplorerSection
            title="Images"
            bucket="images"
            viewMode={viewMode}
            count={counts.images.length}
            loading={mediaLoading}
            emptyLabel={emptyLabel}
            uploadAction={renderUploadAction()}
          >
            <CmsMediaRows
              assets={visibleCmsBuckets.images}
              bucket="images"
              viewMode={viewMode}
              onOpen={openMediaAssetPreview}
              onContextMenu={openContextMenu}
              onKeyDown={openKeyboardContextMenu}
            />
          </ExplorerSection>
        )}

        {shouldShowBucket('videos') && (
          <ExplorerSection
            title="Videos"
            bucket="videos"
            viewMode={viewMode}
            count={counts.videos.length}
            loading={mediaLoading}
            emptyLabel={emptyLabel}
            uploadAction={renderUploadAction()}
          >
            <CmsMediaRows
              assets={visibleCmsBuckets.videos}
              bucket="videos"
              viewMode={viewMode}
              onOpen={openMediaAssetPreview}
              onContextMenu={openContextMenu}
              onKeyDown={openKeyboardContextMenu}
            />
          </ExplorerSection>
        )}

        {shouldShowBucket('other') && (
          <ExplorerSection
            title="Other"
            bucket="other"
            viewMode={viewMode}
            count={counts.other.length}
            loading={mediaLoading}
            emptyLabel={emptyLabel}
            uploadAction={renderUploadAction()}
          >
            <CmsMediaRows
              assets={visibleCmsBuckets.other}
              bucket="other"
              viewMode={viewMode}
              onOpen={openMediaAssetPreview}
              onContextMenu={openContextMenu}
              onKeyDown={openKeyboardContextMenu}
            />
          </ExplorerSection>
        )}
      </Panel>

      {contextMenu && (
        <ExplorerItemContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          ariaLabel="Media item options"
          onClose={() => setContextMenu(null)}
          onRename={() => {
            setRenameTarget(contextMenu.target)
            setContextMenu(null)
          }}
          onDelete={() => { void handleDelete(contextMenu.target) }}
          extraItems={contextMenuItems(contextMenu.target)}
        />
      )}

      {renameTarget && (
        <ExplorerRenameDialog
          title="Rename media"
          fieldLabel="Name"
          initialValue={renameTarget.filename}
          onCancel={() => setRenameTarget(null)}
          onRename={handleRename}
        />
      )}

      <MediaViewerWindow
        editor={viewerEditor}
        open={viewerAsset !== null}
        onClose={() => setViewerAssetId(null)}
      />
    </>
  )
}

interface ExplorerSectionProps {
  title: string
  bucket: MediaBucket
  viewMode: MediaViewMode
  count: number
  /**
   * `true` while the initial fetch is in flight. Renders skeleton
   * rows/tiles matching the loaded layout 1:1 (preview + label + meta)
   * so the swap is silent. We suppress the section's "0" count and the
   * "None yet" empty state while loading — the shimmer carries the
   * loading signal visually.
   */
  loading?: boolean
  uploadAction: ReactNode
  emptyLabel?: string
  children: ReactNode
}

// Per-section skeleton placeholder counts. The section is narrow (one
// column for rows, two columns for grid), so 3–4 placeholders read as
// "a small list is loading" without flooding the panel.
const SKELETON_ROW_COUNT = 3
const SKELETON_TILE_COUNT = 4

function ExplorerSection({
  title,
  bucket,
  viewMode,
  count,
  loading = false,
  uploadAction,
  emptyLabel = 'None yet',
  children,
}: ExplorerSectionProps) {
  return (
    <section className={styles.section} aria-labelledby={`media-section-${title.toLowerCase()}`}>
      <div className={styles.sectionHeader}>
        <h2 id={`media-section-${title.toLowerCase()}`} className={styles.sectionTitle}>
          {title}
        </h2>
        {/* Hide the "0" count during the initial load — the shimmer carries
            the loading signal; doubling it with a "0" count would imply
            "this bucket is empty" before we actually know. */}
        {!loading && <span className={styles.sectionCount}>{count}</span>}
        {uploadAction}
      </div>
      <div
        className={viewMode === 'grid' ? styles.mediaGrid : styles.rows}
        data-testid={viewMode === 'grid' ? `media-grid-${bucket}` : undefined}
        data-media-view={viewMode}
        aria-busy={loading || undefined}
      >
        {loading ? (
          viewMode === 'grid' ? (
            // Grid skeleton — mirrors `.mediaTile` (preview block + body
            // with label + meta) so the populated tile swaps in cleanly.
            Array.from({ length: SKELETON_TILE_COUNT }, (_, i) => (
              <div
                key={`skeleton-tile-${i}`}
                className={styles.mediaTile}
                aria-hidden="true"
              >
                <span className={styles.mediaTilePreview}>
                  <Skeleton width="100%" height="100%" />
                </span>
                <span className={styles.mediaTileBody}>
                  <span className={styles.mediaTileLabel}>
                    <Skeleton width={`${60 + (i % 3) * 12}%`} height={11} />
                  </span>
                  <span className={styles.mediaTileMeta}>
                    <Skeleton width={56} height={9} />
                  </span>
                </span>
              </div>
            ))
          ) : (
            // List skeleton — mirrors `.mediaRow` (28x28 preview + label
            // + meta) so the loaded row footprint is preserved.
            Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => (
              <div
                key={`skeleton-row-${i}`}
                className={cn(styles.row, styles.mediaRow)}
                aria-hidden="true"
              >
                <span className={styles.mediaRowPreview}>
                  <Skeleton width="100%" height="100%" />
                </span>
                <span className={styles.rowLabel}>
                  <Skeleton width={`${50 + (i % 3) * 16}%`} height={11} />
                </span>
                <span className={styles.rowMeta}>
                  <Skeleton width={48} height={10} />
                </span>
              </div>
            ))
          )
        ) : count === 0 ? (
          <EmptyState
            compact
            title={emptyLabel}
            className={styles.sectionEmpty}
          />
        ) : children}
      </div>
    </section>
  )
}

// Shared shape for ExplorerRow (list view) and ExplorerTile (grid view) —
// they accept the same props and only differ in how they render the preview.
// `previewAsset` is the full `CmsMediaAsset` so the `<Image>` primitive can
// build `srcset` from `asset.variants` and let the browser pick the
// smallest-variant-that-fits — the 28×28 list thumb hits the tiny w64
// variant instead of the multi-MB original.
interface MediaExplorerItemProps {
  icon: IconComponent
  label: string
  meta?: string
  ariaLabel: string
  previewKind: MediaBucket
  previewAsset?: CmsMediaAsset
  onClick: () => void
  onContextMenu?: (event: MouseEvent<HTMLButtonElement>) => void
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void
}

function ExplorerRow({
  icon,
  label,
  meta,
  ariaLabel,
  previewKind,
  previewAsset,
  onClick,
  onContextMenu,
  onKeyDown,
}: MediaExplorerItemProps) {
  const RowIcon = icon
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(styles.row, styles.mediaRow)}
      aria-label={ariaLabel}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onKeyDown={onKeyDown}
    >
      <span className={styles.mediaRowPreview} aria-hidden="true">
        {previewKind === 'images' && previewAsset ? (
          // 28-px preview slot — tell the browser the rendered size so it
          // picks the smallest variant from the srcset ladder instead of
          // downloading the full-size original.
          <Image
            asset={previewAsset}
            alt=""
            sizes="28px"
            className={styles.mediaRowImage}
          />
        ) : previewKind === 'videos' && previewAsset ? (
          <video className={styles.mediaRowVideo} src={previewAsset.publicPath} muted preload="metadata" />
        ) : (
          <RowIcon size={13} />
        )}
      </span>
      <span className={styles.rowLabel}>{label}</span>
      {meta && <span className={styles.rowMeta}>{meta}</span>}
    </Button>
  )
}

function ExplorerTile({
  icon,
  label,
  meta,
  ariaLabel,
  previewKind,
  previewAsset,
  onClick,
  onContextMenu,
  onKeyDown,
}: MediaExplorerItemProps) {
  const TileIcon = icon
  return (
    <Button
      variant="ghost"
      size="sm"
      className={styles.mediaTile}
      aria-label={ariaLabel}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onKeyDown={onKeyDown}
    >
      <span className={styles.mediaTilePreview} aria-hidden="true">
        {previewKind === 'images' && previewAsset ? (
          // Grid tile preview — the panel is narrow (two-up grid in a
          // ~280-px panel), so a 160-px sizes hint keeps the browser on
          // the w320 variant on 1× screens and w640 on 2× displays.
          <Image
            asset={previewAsset}
            alt=""
            sizes="160px"
            className={styles.mediaTileImage}
          />
        ) : previewKind === 'videos' && previewAsset ? (
          <video className={styles.mediaTileVideo} src={previewAsset.publicPath} muted preload="metadata" />
        ) : (
          <TileIcon size={22} />
        )}
      </span>
      <span className={styles.mediaTileBody}>
        <span className={styles.mediaTileLabel}>{label}</span>
        {meta && <span className={styles.mediaTileMeta}>{meta}</span>}
      </span>
    </Button>
  )
}

function CmsMediaRows({
  assets,
  bucket,
  viewMode,
  onOpen,
  onContextMenu,
  onKeyDown,
}: {
  assets: CmsMediaAsset[]
  bucket: MediaBucket
  viewMode: MediaViewMode
  onOpen: (asset: CmsMediaAsset) => void
  onContextMenu: (asset: CmsMediaAsset, event: MouseEvent<HTMLButtonElement>) => void
  onKeyDown: (asset: CmsMediaAsset, event: KeyboardEvent<HTMLButtonElement>) => void
}) {
  // The two view modes pass identical props to either ExplorerTile (grid) or
  // ExplorerRow (list). Build the props once per asset and pick the renderer
  // based on viewMode rather than duplicating the entire JSX block.
  const Renderer = viewMode === 'grid' ? ExplorerTile : ExplorerRow
  return assets.map((asset) => (
    <Renderer
      key={asset.id}
      icon={
        asset.mimeType.startsWith('video/')
          ? VideoSolidIcon
          : mediaBucket(asset.mimeType, asset.filename) === 'images'
            ? Image2SolidIcon
            : FolderGlyphIcon
      }
      label={asset.filename}
      meta={asset.publicPath}
      ariaLabel={`Open media ${asset.filename}`}
      previewKind={bucket}
      previewAsset={asset}
      onClick={() => onOpen(asset)}
      onContextMenu={(event) => onContextMenu(asset, event)}
      onKeyDown={(event) => onKeyDown(asset, event)}
    />
  ))
}
