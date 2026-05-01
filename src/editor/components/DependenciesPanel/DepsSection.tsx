/**
 * DepsSection — dependency management content.
 *
 * Migrated from SitePanel/DepsTab.tsx (Task #434 — Migration & SitePanel Cleanup).
 * All functionality preserved:
 *   - SAFE_PACKAGE_NAME validation on every add (Constraint #361 Rule 5 / CWE-78)
 *   - Inline remove confirmation (Guideline #258)
 *   - Search with aria-live result count (WCAG 2.1 AA)
 *   - setDependency / removeDependency store actions (sitePanelSlice)
 *
 * When used as a standalone Dependencies panel, the body is always visible.
 * The collapsible mode remains available for any compact embedded surface.
 *
 * @see Constraint #361 — Phase G Security (Rule 5: package-name validation, CWE-78)
 * @see Guideline #258 — Inline Confirmation UI Pattern
 * @see Contribution #512 — Phase E+ Site Panel UX Spec §4
 * @see Task #434 — Migration & SitePanel Cleanup
 */
import { useState, useRef, useCallback, useMemo } from 'react'
import { useEditorStore } from '../../../core/editor-store/store'
import { Button } from '@ui/components/Button'
import { Input } from '@ui/components/Input'
import { SearchBar } from '@ui/components/SearchBar'
import { Switch } from '@ui/components/Switch'
import { PackageIcon } from '@ui/icons/icons/package'
import { PlusIcon } from '@ui/icons/icons/plus'
import { CloseIcon } from '@ui/icons/icons/close'
import { ChevronRightIcon } from '@ui/icons/icons/chevron-right'
import { cn } from '@ui/cn'
import { isSafePackageName } from '../../../core/site-dependencies/packageNames'
import {
  getSiteModuleDependencyUsage,
  type SiteModuleDependencyUsage,
} from '../../../core/module-engine/dependencies'
import { registry } from '../../../core/module-engine/registry'
import styles from './DepsSection.module.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RemoveConfirmState {
  name: string
  /** TODO(Phase G): used by `bun remove --dev` when bridge is active */
  dev: boolean
}

// ---------------------------------------------------------------------------
// DepsSection
// ---------------------------------------------------------------------------

interface DepsSectionProps {
  collapsible?: boolean
  defaultExpanded?: boolean
}

export function DepsSection({
  collapsible = true,
  defaultExpanded = false,
}: DepsSectionProps) {
  const site = useEditorStore((s) => s.site)
  const packageJson = useEditorStore((s) => s.packageJson)
  const setDependency = useEditorStore((s) => s.setDependency)
  const removeDependency = useEditorStore((s) => s.removeDependency)

  // ── Section collapse state ───────────────────────────────────────────────
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  // ── Local state ─────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [addName, setAddName] = useState('')
  const [addDev, setAddDev] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [removeConfirm, setRemoveConfirm] = useState<RemoveConfirmState | null>(null)

  const cancelRef = useRef<HTMLButtonElement>(null)

  // ── Filtered deps ────────────────────────────────────────────────────────
  const filterDeps = useCallback(
    (deps: Record<string, string>) => {
      if (!searchQuery.trim()) return Object.entries(deps)
      const q = searchQuery.toLowerCase()
      return Object.entries(deps).filter(([name]) => name.toLowerCase().includes(q))
    },
    [searchQuery],
  )

  const filteredDeps = useMemo(
    () => filterDeps(packageJson.dependencies),
    [filterDeps, packageJson.dependencies],
  )
  const filteredDevDeps = useMemo(
    () => filterDeps(packageJson.devDependencies),
    [filterDeps, packageJson.devDependencies],
  )
  const dependencyUsage = useMemo(
    () => getSiteModuleDependencyUsage(site, registry),
    [site],
  )

  const totalFiltered = filteredDeps.length + filteredDevDeps.length
  const totalAll =
    Object.keys(packageJson.dependencies).length +
    Object.keys(packageJson.devDependencies).length

  // ── Add package handler ──────────────────────────────────────────────────
  const handleAddPackage = useCallback(() => {
    const name = addName.trim()
    if (!name) {
      setAddError('Package name is required')
      return
    }
    // Client-side gate (Constraint #361 Rule 5) — validate every dispatch
    if (!isSafePackageName(name)) {
      setAddError('Invalid package name (lowercase, no special chars)')
      return
    }
    setDependency(name, '*', addDev)
    setAddName('')
    setAddError(null)
    // TODO(Phase G): ask the site bridge to install this in the user site.
  }, [addName, addDev, setDependency])

  // ── Remove confirmation (Guideline #258) ────────────────────────────────
  const requestRemove = useCallback(
    (name: string, dev: boolean) => {
      setRemoveConfirm({ name, dev })
      // Focus moves to Cancel button on reveal (Guideline #258)
      requestAnimationFrame(() => cancelRef.current?.focus())
    },
    [],
  )

  const confirmRemove = useCallback(() => {
    if (removeConfirm) {
      removeDependency(removeConfirm.name)
      setRemoveConfirm(null)
      // TODO(Phase G): ask the site bridge to remove this from the user site.
    }
  }, [removeConfirm, removeDependency])

  const cancelRemove = useCallback(() => {
    setRemoveConfirm(null)
  }, [])

  const handleRemoveKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        cancelRemove()
      }
    },
    [cancelRemove],
  )

  // ── Add input validation on change ───────────────────────────────────────
  const handleAddNameChange = useCallback((value: string) => {
    setAddName(value)
    if (!value.trim()) {
      setAddError(null)
      return
    }
    if (!isSafePackageName(value.trim())) {
      setAddError('Invalid package name (use lowercase, hyphens, dots, @ scopes)')
    } else {
      setAddError(null)
    }
  }, [])

  const depCount = totalAll

  const body = (
    <div
      id="deps-section-body"
      className={cn(styles.body, !collapsible && styles.bodyStandalone)}
      data-testid="deps-tab"
    >
      <div>
        <SearchBar
          value={searchQuery}
          onValueChange={setSearchQuery}
          placeholder="Search packages..."
          aria-label="Search packages"
        />
        {/* Live region for search results (Guideline #221) */}
        <div
          aria-live="polite"
          aria-atomic="true"
          className={styles.srLiveRegion}
        >
          {searchQuery
            ? `${totalFiltered} of ${totalAll} packages shown`
            : ''}
        </div>
      </div>

      {/* ─── Package list ──────────────────────────────────────────── */}
      <div className={styles.packageList}>
        {/* dependencies section */}
        {filteredDeps.length > 0 && (
          <>
            <div className={styles.sectionLabel}>dependencies</div>
            {filteredDeps.map(([name, version]) => (
              <DepRow
                key={name}
                name={name}
                version={version}
                dev={false}
                usage={dependencyUsage.get(name)}
                onRemove={requestRemove}
                confirmState={removeConfirm}
                cancelRef={cancelRef}
                onConfirmRemove={confirmRemove}
                onCancelRemove={cancelRemove}
                onKeyDown={handleRemoveKeyDown}
              />
            ))}
          </>
        )}

        {/* devDependencies section */}
        {filteredDevDeps.length > 0 && (
          <>
            <div className={styles.sectionLabel}>devDependencies</div>
            {filteredDevDeps.map(([name, version]) => (
              <DepRow
                key={name}
                name={name}
                version={version}
                dev={true}
                usage={dependencyUsage.get(name)}
                onRemove={requestRemove}
                confirmState={removeConfirm}
                cancelRef={cancelRef}
                onConfirmRemove={confirmRemove}
                onCancelRemove={cancelRemove}
                onKeyDown={handleRemoveKeyDown}
              />
            ))}
          </>
        )}

        {/* Empty / no-results state */}
        {filteredDeps.length === 0 && filteredDevDeps.length === 0 && (
          <div className={styles.emptyMsg}>
            {searchQuery ? `No packages matching "${searchQuery}"` : 'No dependencies yet.'}
          </div>
        )}
      </div>

      {/* ─── Add package form ──────────────────────────────────────── */}
      <div className={styles.addForm}>
        <div className={styles.addRow}>
          <div className={styles.addInputArea}>
            <div className={styles.addInputWrapper}>
              <PackageIcon size={11} color="var(--editor-text-subtle)" aria-hidden="true" />
              <Input
                data-testid="add-dep-input"
                type="text"
                fieldSize="sm"
                value={addName}
                onChange={(e) => handleAddNameChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddPackage()
                }}
                monospace
                placeholder="package-name"
                aria-label="Add package name"
                aria-describedby={addError ? 'deps-add-error' : undefined}
                invalid={Boolean(addError)}
                className={styles.addInput}
              />
            </div>
            {addError && (
              <div
                id="deps-add-error"
                role="alert"
                className={styles.addError}
              >
                {addError}
              </div>
            )}
          </div>

          <Button
            variant="primary"
            size="xs"
            onClick={handleAddPackage}
            disabled={!!addError || !addName.trim()}
            aria-label="Add dependency"
            title="Add dependency"
          >
            <PlusIcon size={11} aria-hidden="true" />
            Add
          </Button>
        </div>

        {/* dev toggle */}
        <label className={styles.devToggle}>
          <Switch
            checked={addDev}
            onCheckedChange={setAddDev}
            switchSize="sm"
          />
          <span className={styles.devLabel}>devDependency</span>
        </label>
      </div>
    </div>
  )

  return (
    <div
      className={cn(styles.section, !collapsible && styles.sectionStandalone)}
      data-testid="deps-section"
    >
      {!collapsible ? body : (
        <>
      {/* ─── Collapsible section header ────────────────────────────────── */}
      <button
        type="button"
        aria-expanded={isExpanded}
        aria-controls="deps-section-body"
        onClick={() => setIsExpanded((v) => !v)}
        className={styles.sectionToggle}
      >
        <span aria-hidden="true" className={cn(styles.chevron, isExpanded && styles.chevronOpen)}>
          <ChevronRightIcon size={10} />
        </span>
        <span aria-hidden="true" className={styles.sectionIcon}>
          <PackageIcon size={11} />
        </span>
        <span className={styles.sectionTitle}>Dependencies</span>
        {depCount > 0 && (
          <span className={styles.depCount} aria-label={`${depCount} packages`}>
            {depCount}
          </span>
        )}
      </button>

      {/* ─── Section body (collapsed by default) ──────────────────────── */}
      {isExpanded && body}
      </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// DepRow — single dependency row with inline remove confirmation
// ---------------------------------------------------------------------------

interface DepRowProps {
  name: string
  version: string
  dev: boolean
  usage?: SiteModuleDependencyUsage
  onRemove: (name: string, dev: boolean) => void
  confirmState: RemoveConfirmState | null
  cancelRef: React.RefObject<HTMLButtonElement | null>
  onConfirmRemove: () => void
  onCancelRemove: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
}

function DepRow({
  name,
  version,
  dev,
  usage,
  onRemove,
  confirmState,
  cancelRef,
  onConfirmRemove,
  onCancelRemove,
  onKeyDown,
}: DepRowProps) {
  const isPendingRemoval = confirmState?.name === name

  if (isPendingRemoval) {
    // Inline confirmation (Guideline #258)
    return (
      <div
        data-testid={`dep-row-${name}`}
        onKeyDown={onKeyDown}
        className={styles.depRowConfirm}
      >
        <span className={styles.depConfirmText}>
          Remove <strong>{name}</strong>?
          {usage && (
            <span className={styles.depConfirmDetail}>
              {' '}Used by {formatModuleUsage(usage)}.
            </span>
          )}
        </span>
        <Button
          variant="destructive"
          size="sm"
          onClick={onConfirmRemove}
          aria-label={`Confirm remove ${name}`}
        >
          Remove
        </Button>
        <Button
          ref={cancelRef}
          variant="secondary"
          size="sm"
          onClick={onCancelRemove}
          aria-label="Cancel remove"
        >
          Cancel
        </Button>
      </div>
    )
  }

  return (
    <div
      data-testid={`dep-row-${name}`}
      className={styles.depRow}
    >
      <span className={styles.depRowIcon} aria-hidden="true">
        <PackageIcon size={11} />
      </span>
      <span
        className={styles.depName}
        title={name}
      >
        {name}
      </span>
      <span className={styles.depVersion}>
        {version}
      </span>
      {usage && (
        <span
          className={styles.depUsage}
          title={`Required by ${formatModuleUsage(usage)}`}
        >
          in use
        </span>
      )}
      <Button
        variant="ghost"
        size="xs"
        iconOnly
        data-testid={`remove-dep-${name}`}
        onClick={() => onRemove(name, dev)}
        aria-label={`Remove ${name}`}
        title={`Remove ${name}`}
      >
        <CloseIcon size={10} aria-hidden="true" />
      </Button>
    </div>
  )
}

function formatModuleUsage(usage: SiteModuleDependencyUsage): string {
  if (usage.modules.length <= 2) return usage.modules.join(', ')
  return `${usage.modules.slice(0, 2).join(', ')} +${usage.modules.length - 2}`
}
