/**
 * sitePanelSlice — Dependency management state (Phase E+).
 *
 * Owns the in-memory `packageJson` manifest.
 * The SitePanel overlay UI was deleted in Task #434 (Guideline #410: 5-panel layout);
 * DependenciesPanel now owns all dependency UI through DepsSection.tsx.
 *
 * This slice retains only the live fields consumed by DepsSection.tsx:
 *   - packageJson         in-memory package.json manifest
 *   - setDependency       add/update a dependency
 *   - removeDependency    remove from both dependency buckets
 *
 * All setters include no-op guards (Guideline #242).
 *
 * @see Guideline #341 — Zustand Store Slice Registry (addendum)
 * @see Guideline #242 — Zustand Object Setters Must Guard Against No-Op Mutations
 * @see Task #434 — Migration & SitePanel Cleanup
 * @see Task #441 — Post-#434 Orphan Sweep (panel-toggle fields removed)
 */

import type { StateCreator } from 'zustand'
import type { EditorStore } from '../store'
import {
  clonePackageJson,
  DEFAULT_SITE_PACKAGE_JSON,
  type SitePackageJson,
} from '../../site-dependencies/manifest'
import { isSafePackageName } from '../../site-dependencies/packageNames'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Minimal package.json shape for the in-memory manifest.
   * Stores only the dependency maps relevant to DependenciesPanel.
 */
export type PackageJson = SitePackageJson

export interface SitePanelSlice {
  /**
   * In-memory package.json manifest.
   * Tracks intended site deps; installing is a separate bridge concern.
   */
  packageJson: PackageJson

  // ── Actions ──────────────────────────────────────────────────────────────

  /**
   * Add or update a dependency in the in-memory manifest.
   * @param name    npm package name (must pass SAFE_PACKAGE_NAME before dispatch)
   * @param version semver string, e.g. "^18.2.0" or "*"
   * @param dev     true → devDependencies; false/undefined → dependencies
   */
  setDependency: (name: string, version: string, dev?: boolean) => void

  /**
   * Remove a package from both dependencies and devDependencies.
   */
  removeDependency: (name: string) => void

}

// ---------------------------------------------------------------------------
// Slice factory
// ---------------------------------------------------------------------------

export const createSitePanelSlice: StateCreator<
  EditorStore,
  [],
  [],
  SitePanelSlice
> = (set, get) => ({
  packageJson: clonePackageJson(DEFAULT_SITE_PACKAGE_JSON),

  setDependency: (name, version, dev = false) => {
    if (!isSafePackageName(name)) return
    const safeVersion = version.trim() || '*'
    const current = get().packageJson
    const bucket = dev ? 'devDependencies' : 'dependencies'
    const otherBucket = dev ? 'dependencies' : 'devDependencies'
    // No-op guard (Guideline #242): skip if value unchanged and no bucket move is needed.
    if (Object.is(current[bucket][name], safeVersion) && !(name in current[otherBucket])) return
    set((s) => {
      const nextBucket = { ...s.packageJson[bucket], [name]: safeVersion }
      const nextOtherBucket = { ...s.packageJson[otherBucket] }
      delete nextOtherBucket[name]
      const nextPackageJson = {
        ...s.packageJson,
        [bucket]: nextBucket,
        [otherBucket]: nextOtherBucket,
      }
      return {
        packageJson: nextPackageJson,
        site: s.site
          ? { ...s.site, packageJson: nextPackageJson, updatedAt: Date.now() }
          : s.site,
      }
    })
  },

  removeDependency: (name) => {
    const { dependencies, devDependencies } = get().packageJson
    // No-op guard: package not present in either bucket
    if (!(name in dependencies) && !(name in devDependencies)) return
    set((s) => {
      const deps = { ...s.packageJson.dependencies }
      const devDeps = { ...s.packageJson.devDependencies }
      delete deps[name]
      delete devDeps[name]
      const nextPackageJson = { ...s.packageJson, dependencies: deps, devDependencies: devDeps }
      return {
        packageJson: nextPackageJson,
        site: s.site
          ? { ...s.site, packageJson: nextPackageJson, updatedAt: Date.now() }
          : s.site,
      }
    })
  },

})
