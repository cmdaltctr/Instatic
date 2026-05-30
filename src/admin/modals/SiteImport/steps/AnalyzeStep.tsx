/**
 * AnalyzeStep — the second step of the Super Import wizard.
 *
 * Two-pane layout:
 *   Left — file tree showing every file with its classified role.
 *   Right — editable summary: pages (with inline slug edit), style rules,
 *           media, and skipped items.
 *
 * The user can toggle individual pages/rules/assets in or out of the import
 * and edit page slugs before the plan is committed.
 */
import { Switch } from '@ui/components/Switch'
import { Input } from '@ui/components/Input'
import {
  TreeContainer,
  TreeRow,
  TreeIconSlot,
  TreeLabelGroup,
  TreeLabel,
  TreeMeta,
} from '@site/ui/Tree'
import { FolderGlyphIcon } from 'pixel-art-icons/icons/folder-glyph'
import { FileTextSolidIcon } from 'pixel-art-icons/icons/file-text-solid'
import { ImageSolidIcon } from 'pixel-art-icons/icons/image-solid'
import { CodeIcon } from 'pixel-art-icons/icons/code'
import { classifyFiles } from '@core/siteImport'
import type { ImportPlan, FileMap, FileRole } from '@core/siteImport'
import type { ImportSelection } from '../SiteImportModal'
import styles from './AnalyzeStep.module.css'

interface AnalyzeStepProps {
  plan: ImportPlan
  fileMap: FileMap
  selection: ImportSelection
  pageSlugOverrides: Map<string, string>
  onSelectionChange: (next: ImportSelection) => void
  onSlugOverride: (source: string, slug: string) => void
}

export function AnalyzeStep({
  plan,
  fileMap,
  selection,
  pageSlugOverrides,
  onSelectionChange,
  onSlugOverride,
}: AnalyzeStepProps) {
  const classified = classifyFiles(fileMap)

  // Build a simple folder-based tree grouping paths by their directory prefix.
  const filesByFolder = new Map<string, typeof classified>()
  for (const file of classified) {
    const parts = file.path.split('/')
    const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : ''
    const existing = filesByFolder.get(folder)
    if (existing) existing.push(file)
    else filesByFolder.set(folder, [file])
  }
  const sortedFolders = Array.from(filesByFolder.keys()).sort()

  function togglePage(source: string) {
    const next = new Set(selection.pagesIncluded)
    if (next.has(source)) next.delete(source)
    else next.add(source)
    onSelectionChange({ ...selection, pagesIncluded: next })
  }

  function toggleRule(index: number) {
    const next = new Set(selection.styleRulesIncluded)
    if (next.has(index)) next.delete(index)
    else next.add(index)
    onSelectionChange({ ...selection, styleRulesIncluded: next })
  }

  function toggleAsset(sourcePath: string) {
    const next = new Set(selection.assetsIncluded)
    if (next.has(sourcePath)) next.delete(sourcePath)
    else next.add(sourcePath)
    onSelectionChange({ ...selection, assetsIncluded: next })
  }

  const pageCount = plan.pages.filter((p) => selection.pagesIncluded.has(p.source)).length
  const ruleCount = plan.styleRules.filter((_, i) => selection.styleRulesIncluded.has(i)).length
  const assetCount = plan.assets.filter((a) => selection.assetsIncluded.has(a.sourcePath)).length
  const droppedCount = plan.droppedJs.length + plan.droppedAtRules.length + plan.unusedCss.length

  return (
    <div className={styles.layout}>
      {/* ── Left pane: file tree ────────────────────────────────────────── */}
      <aside className={styles.leftPane}>
        <p className={styles.paneHeading}>Files</p>
        <TreeContainer ariaLabel="Import file tree" className={styles.tree}>
          {sortedFolders.map((folder) => {
            const files = filesByFolder.get(folder) ?? []
            const depth = folder ? folder.split('/').length : 0
            return (
              <div key={folder || '__root__'}>
                {folder && (
                  <TreeRow depth={depth - 1}>
                    <TreeIconSlot icon={FolderGlyphIcon} iconSize={12} />
                    <TreeLabelGroup>
                      <TreeLabel>{folder.split('/').pop()}</TreeLabel>
                    </TreeLabelGroup>
                  </TreeRow>
                )}
                {files.map((file) => {
                  const name = file.path.split('/').pop() ?? file.path
                  const Icon = roleIcon(file.role)
                  return (
                    <TreeRow key={file.path} depth={depth} muted={file.role === 'js' || file.role === 'meta'}>
                      <TreeIconSlot icon={Icon} iconSize={12} />
                      <TreeLabelGroup>
                        <TreeLabel>{name}</TreeLabel>
                        <TreeMeta>{file.role}</TreeMeta>
                      </TreeLabelGroup>
                    </TreeRow>
                  )
                })}
              </div>
            )
          })}
        </TreeContainer>
      </aside>

      {/* ── Right pane: editable plan summary ──────────────────────────── */}
      <div className={styles.rightPane}>
        {/* Summary bar */}
        <p className={styles.summary}>
          Importing{' '}
          <strong>{pageCount} {pageCount === 1 ? 'page' : 'pages'}</strong>,{' '}
          <strong>{ruleCount} style {ruleCount === 1 ? 'rule' : 'rules'}</strong>,{' '}
          <strong>{assetCount} media {assetCount === 1 ? 'file' : 'files'}</strong>.
          {droppedCount > 0 && ` Dropping ${droppedCount} unsupported items.`}
        </p>

        {/* Pages */}
        {plan.pages.length > 0 && (
          <section className={styles.section}>
            <h3 className={styles.sectionHeading}>
              Pages ({plan.pages.length})
            </h3>
            <ul className={styles.list}>
              {plan.pages.map((page) => {
                const included = selection.pagesIncluded.has(page.source)
                const slug = pageSlugOverrides.get(page.source) ?? page.slug
                return (
                  <li key={page.source} className={styles.pageRow}>
                    <Switch
                      checked={included}
                      switchSize="sm"
                      onCheckedChange={() => togglePage(page.source)}
                      aria-label={`Include page ${page.title}`}
                    />
                    <div className={styles.pageInfo}>
                      <span className={styles.pageTitle}>{page.title}</span>
                      <TreeMeta>{page.source}</TreeMeta>
                    </div>
                    {included && (
                      <Input
                        fieldSize="sm"
                        value={slug}
                        onChange={(e) => onSlugOverride(page.source, e.target.value)}
                        placeholder="page-slug"
                        aria-label={`Slug for ${page.title}`}
                        className={styles.slugInput}
                        prefix="/"
                      />
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {/* Style rules */}
        {plan.styleRules.length > 0 && (
          <section className={styles.section}>
            <h3 className={styles.sectionHeading}>
              Style rules ({plan.styleRules.length})
            </h3>
            <ul className={styles.list}>
              {plan.styleRules.map((rule, i) => {
                const included = selection.styleRulesIncluded.has(i)
                return (
                  <li key={i} className={styles.ruleRow}>
                    <Switch
                      checked={included}
                      switchSize="sm"
                      onCheckedChange={() => toggleRule(i)}
                      aria-label={`Include rule ${rule.name}`}
                    />
                    <span
                      className={styles.ruleName}
                      data-muted={!included ? 'true' : undefined}
                    >
                      {rule.kind === 'class' ? '.' : ''}{rule.name}
                    </span>
                    <TreeMeta>{rule.kind}</TreeMeta>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {/* Media */}
        {plan.assets.length > 0 && (
          <section className={styles.section}>
            <h3 className={styles.sectionHeading}>
              Media ({plan.assets.length})
            </h3>
            <ul className={styles.list}>
              {plan.assets.map((asset) => {
                const included = selection.assetsIncluded.has(asset.sourcePath)
                const name = asset.sourcePath.split('/').pop() ?? asset.sourcePath
                return (
                  <li key={asset.sourcePath} className={styles.assetRow}>
                    <Switch
                      checked={included}
                      switchSize="sm"
                      onCheckedChange={() => toggleAsset(asset.sourcePath)}
                      aria-label={`Include asset ${name}`}
                    />
                    <span
                      className={styles.assetName}
                      data-muted={!included ? 'true' : undefined}
                    >
                      {name}
                    </span>
                    <TreeMeta>{asset.mimeType}</TreeMeta>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {/* Skipped items */}
        {droppedCount > 0 && (
          <section className={styles.section}>
            <h3 className={styles.sectionHeading}>
              Skipped ({droppedCount})
            </h3>
            <ul className={styles.list}>
              {plan.droppedJs.map((path) => (
                <li key={path} className={styles.skippedRow}>
                  <span className={styles.skippedPath}>{path}</span>
                  <TreeMeta>script — dropped</TreeMeta>
                </li>
              ))}
              {plan.unusedCss.map((path) => (
                <li key={path} className={styles.skippedRow}>
                  <span className={styles.skippedPath}>{path}</span>
                  <TreeMeta>css — unlinked</TreeMeta>
                </li>
              ))}
              {plan.droppedAtRules.slice(0, 6).map((src, i) => (
                <li key={i} className={styles.skippedRow}>
                  <span className={styles.skippedPath} title={src}>
                    {src.slice(0, 60)}{src.length > 60 ? '…' : ''}
                  </span>
                  <TreeMeta>@-rule — dropped</TreeMeta>
                </li>
              ))}
              {plan.droppedAtRules.length > 6 && (
                <li className={styles.skippedRow}>
                  <TreeMeta>…and {plan.droppedAtRules.length - 6} more @-rules</TreeMeta>
                </li>
              )}
            </ul>
          </section>
        )}

        {/* Warnings */}
        {plan.warnings.length > 0 && (
          <p className={styles.warningsNote}>
            {plan.warnings.length} warning{plan.warnings.length !== 1 ? 's' : ''} — review after import.
          </p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roleIcon(role: FileRole) {
  switch (role) {
    case 'html':
    case 'css':
    case 'js':   return CodeIcon
    case 'image':
    case 'font':
    case 'binary': return ImageSolidIcon
    default: return FileTextSolidIcon
  }
}
