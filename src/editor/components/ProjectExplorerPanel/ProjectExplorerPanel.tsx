import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { useEditorStore } from '@core/editor-store/store'
import type { ProjectFile } from '@core/files/types'
import { checkSizeLimit, detectMimeType } from '@core/files/upload'
import {
  listCmsMediaAssets,
  uploadCmsMediaAsset,
  type CmsMediaAsset,
} from '@core/persistence/cmsMedia'
import { PanelHeader } from '../shared/PanelHeader'
import { Button } from '@ui/components/Button'
import { FileUpload } from '@ui/components/FileUpload'
import { Icon } from '@ui/icons/Icon'
import { cn } from '@ui/cn'
import {
  ProjectCreateDialog,
  buildScriptPath,
  buildStylePath,
  slugifyProjectName,
  toPascalCaseProjectName,
  type ProjectCreateKind,
} from '../ProjectCreateDialog'
import styles from './ProjectExplorerPanel.module.css'

interface ProjectExplorerPanelProps {
  variant?: 'docked'
  mediaMode?: 'project' | 'cms'
}

type FileBucket = 'styles' | 'assets' | 'scripts'

const EMPTY_FILES: ProjectFile[] = []

function fileName(path: string) {
  return path.split('/').pop() ?? path
}

function safeAssetName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function groupProjectFiles(files: ProjectFile[]) {
  const visible = files.filter((file) => !file.generated || file.ejected)
  return {
    styles: visible.filter((file) => file.type === 'style'),
    assets: visible.filter((file) => file.type === 'asset'),
    scripts: visible.filter((file) => file.type === 'script'),
  } satisfies Record<FileBucket, ProjectFile[]>
}

async function blobToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function ProjectExplorerPanel({
  variant = 'docked',
  mediaMode = 'project',
}: ProjectExplorerPanelProps) {
  const isOpen = useEditorStore((s) => s.projectExplorerPanelOpen)
  const project = useEditorStore((s) => s.project)
  const activePageId = useEditorStore((s) => s.activePageId)
  const activeDocument = useEditorStore((s) => s.activeDocument)
  const setProjectExplorerPanelOpen = useEditorStore((s) => s.setProjectExplorerPanelOpen)
  const openPageInCanvas = useEditorStore((s) => s.openPageInCanvas)
  const setActiveDocument = useEditorStore((s) => s.setActiveDocument)
  const addPage = useEditorStore((s) => s.addPage)
  const createVisualComponent = useEditorStore((s) => s.createVisualComponent)
  const createFile = useEditorStore((s) => s.createFile)
  const updateFileBlob = useEditorStore((s) => s.updateFileBlob)
  const openInEditor = useEditorStore((s) => s.openInEditor)
  const openMediaAssetPreview = useEditorStore((s) => s.openMediaAssetPreview)
  const [createKind, setCreateKind] = useState<ProjectCreateKind | null>(null)
  const [cmsAssets, setCmsAssets] = useState<CmsMediaAsset[]>([])
  const [mediaError, setMediaError] = useState<string | null>(null)
  const [mediaLoading, setMediaLoading] = useState(false)
  const panelRef = useRef<HTMLElement>(null)

  const files = project?.files ?? EMPTY_FILES
  const fileBuckets = useMemo(() => groupProjectFiles(files), [files])
  const usingCmsMedia = mediaMode === 'cms'
  const assetCount = usingCmsMedia ? cmsAssets.length : fileBuckets.assets.length

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => panelRef.current?.focus())
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !usingCmsMedia) return

    let canceled = false
    setMediaLoading(true)
    setMediaError(null)
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
  }, [isOpen, usingCmsMedia])

  if (!isOpen || variant !== 'docked') return null

  function handleCreate(name: string) {
    if (!createKind) return

    try {
      if (createKind === 'page') {
        const page = addPage(name, slugifyProjectName(name))
        openPageInCanvas(page.id)
      } else if (createKind === 'component') {
        const vcId = createVisualComponent(toPascalCaseProjectName(name))
        setActiveDocument({ kind: 'visualComponent', vcId })
      } else if (createKind === 'style') {
        const fileId = createFile(buildStylePath(name), 'style', '')
        openInEditor(fileId)
      } else {
        const fileId = createFile(buildScriptPath(name), 'script', '')
        openInEditor(fileId)
      }
      setCreateKind(null)
    } catch (err) {
      console.error('[ProjectExplorerPanel] create project item error:', err)
    }
  }

  async function handleAssetUpload(e: ChangeEvent<HTMLInputElement>) {
    const pickedFiles = Array.from(e.target.files ?? [])
    e.target.value = ''

    for (const file of pickedFiles) {
      const sizeCheck = checkSizeLimit(file.size)
      if (!sizeCheck.ok) {
        console.warn('[ProjectExplorerPanel] Upload rejected:', sizeCheck.message)
        continue
      }

      const path = `public/${safeAssetName(file.name)}`
      try {
        if (usingCmsMedia) {
          const asset = await uploadCmsMediaAsset(file)
          setCmsAssets((assets) => [asset, ...assets.filter((item) => item.id !== asset.id)])
          continue
        }

        const fileId = createFile(path, detectMimeType(file.type, path))
        updateFileBlob(fileId, {
          mimeType: file.type || 'application/octet-stream',
          base64: await blobToBase64(file),
        })
      } catch (err) {
        console.error('[ProjectExplorerPanel] upload asset error:', err)
      }
    }
  }

  const pages = project?.pages ?? []
  const components = project?.visualComponents ?? []
  const assetEmptyLabel = mediaLoading ? 'Loading...' : mediaError ?? 'None yet'

  return (
    <>
      <aside
        ref={panelRef}
        role="complementary"
        aria-label="Project Explorer"
        data-panel=""
        data-testid="project-explorer-panel"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={styles.panel}
      >
        <PanelHeader
          panelId="project-explorer"
          title="Project"
          onClose={() => setProjectExplorerPanelOpen(false)}
        />

        <div className={styles.content}>
          {!project ? (
            <div className={styles.emptyState}>No project loaded</div>
          ) : (
            <>
              <ExplorerSection
                title="Pages"
                count={pages.length}
                actionLabel="New page"
                actionIcon="file-plus"
                onAction={() => setCreateKind('page')}
              >
                {pages.map((page) => (
                  <ExplorerRow
                    key={page.id}
                    icon="file-text"
                    label={page.title}
                    meta={page.slug === 'index' ? '/' : `/${page.slug}`}
                    active={page.id === activePageId && activeDocument?.kind !== 'visualComponent'}
                    ariaLabel={`Open page ${page.title}`}
                    onClick={() => openPageInCanvas(page.id)}
                  />
                ))}
              </ExplorerSection>

              <ExplorerSection
                title="Components"
                count={components.length}
                actionLabel="New component"
                actionIcon="braces"
                onAction={() => setCreateKind('component')}
              >
                {components.map((component) => (
                  <ExplorerRow
                    key={component.id}
                    icon="braces"
                    label={component.name}
                    meta={`${component.params.length} props`}
                    active={activeDocument?.kind === 'visualComponent' && activeDocument.vcId === component.id}
                    ariaLabel={`Open component ${component.name}`}
                    onClick={() => setActiveDocument({ kind: 'visualComponent', vcId: component.id })}
                  />
                ))}
              </ExplorerSection>

              <ExplorerSection
                title="Styles"
                count={fileBuckets.styles.length}
                actionLabel="New stylesheet"
                actionIcon="paint-bucket"
                onAction={() => setCreateKind('style')}
              >
                <FileRows files={fileBuckets.styles} icon="paint-bucket" onOpen={openInEditor} />
              </ExplorerSection>

              <ExplorerSection
                title="Assets"
                count={assetCount}
                actionLabel="Upload asset"
                actionIcon="upload"
                emptyLabel={assetEmptyLabel}
                uploadAction={<FileUpload
                  multiple
                  accept={usingCmsMedia ? 'image/*,video/*' : undefined}
                  onChange={handleAssetUpload}
                  buttonProps={{
                    variant: 'ghost',
                    size: 'xs',
                    iconOnly: true,
                    title: 'Upload asset',
                    'aria-label': 'Upload asset',
                  }}
                >
                  <Icon name="upload" size={13} />
                </FileUpload>}
              >
                {usingCmsMedia ? (
                  <MediaRows assets={cmsAssets} onOpen={openMediaAssetPreview} />
                ) : (
                  <FileRows files={fileBuckets.assets} icon="image-2" onOpen={openInEditor} />
                )}
              </ExplorerSection>

              <ExplorerSection
                title="Scripts"
                count={fileBuckets.scripts.length}
                actionLabel="New script"
                actionIcon="code"
                onAction={() => setCreateKind('script')}
              >
                <FileRows files={fileBuckets.scripts} icon="code" onOpen={openInEditor} />
              </ExplorerSection>
            </>
          )}
        </div>
      </aside>

      {createKind && (
        <ProjectCreateDialog
          kind={createKind}
          onCancel={() => setCreateKind(null)}
          onCreate={handleCreate}
        />
      )}
    </>
  )
}

interface ExplorerSectionProps {
  title: string
  count: number
  actionLabel: string
  actionIcon: string
  onAction?: () => void
  uploadAction?: ReactNode
  emptyLabel?: string
  children: ReactNode
}

function ExplorerSection({
  title,
  count,
  actionLabel,
  actionIcon,
  onAction,
  uploadAction,
  emptyLabel = 'None yet',
  children,
}: ExplorerSectionProps) {
  return (
    <section className={styles.section} aria-labelledby={`project-section-${title.toLowerCase()}`}>
      <div className={styles.sectionHeader}>
        <h2 id={`project-section-${title.toLowerCase()}`} className={styles.sectionTitle}>
          {title}
        </h2>
        <span className={styles.sectionCount}>{count}</span>
        {uploadAction ?? (
          <Button
            variant="ghost"
            size="xs"
            iconOnly
            aria-label={actionLabel}
            title={actionLabel}
            onClick={onAction}
          >
            <Icon name={actionIcon} size={13} />
          </Button>
        )}
      </div>
      <div className={styles.rows}>
        {count === 0 ? <div className={styles.sectionEmpty}>{emptyLabel}</div> : children}
      </div>
    </section>
  )
}

interface ExplorerRowProps {
  icon: string
  label: string
  meta?: string
  active?: boolean
  ariaLabel: string
  onClick: () => void
}

function ExplorerRow({ icon, label, meta, active = false, ariaLabel, onClick }: ExplorerRowProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(styles.row, active && styles.rowActive)}
      aria-label={ariaLabel}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
    >
      <Icon name={icon} size={13} />
      <span className={styles.rowLabel}>{label}</span>
      {meta && <span className={styles.rowMeta}>{meta}</span>}
    </Button>
  )
}

function FileRows({
  files,
  icon,
  onOpen,
}: {
  files: ProjectFile[]
  icon: string
  onOpen: (fileId: string) => void
}) {
  return files.map((file) => (
    <ExplorerRow
      key={file.id}
      icon={icon}
      label={fileName(file.path)}
      meta={file.path}
      ariaLabel={`Open ${fileName(file.path)}`}
      onClick={() => onOpen(file.id)}
    />
  ))
}

function MediaRows({
  assets,
  onOpen,
}: {
  assets: CmsMediaAsset[]
  onOpen: (asset: CmsMediaAsset) => void
}) {
  return assets.map((asset) => (
    <ExplorerRow
      key={asset.id}
      icon={asset.mimeType.startsWith('video/') ? 'video' : 'image-2'}
      label={asset.filename}
      meta={asset.publicPath}
      ariaLabel={`Open media ${asset.filename}`}
      onClick={() => onOpen(asset)}
    />
  ))
}
