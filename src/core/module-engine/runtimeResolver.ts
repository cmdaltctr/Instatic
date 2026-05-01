import type { AnyModuleDefinition } from './types'
import {
  getSiteDependencyVersion,
  normalizeModuleDependencies,
  type NormalizedModuleDependency,
} from './dependencies'
import type { SitePackageJson } from '../site-dependencies/manifest'

const DEFAULT_ESM_CDN_ORIGIN = 'https://esm.sh'

export interface RuntimeResolverOptions {
  origin?: string
  packageJson?: SitePackageJson
  strictSiteManifest?: boolean
}

export interface ModuleImportMap {
  imports: Record<string, string>
}

function normalizeVersionRange(version: string): string {
  const trimmed = version.trim()
  if (!trimmed || trimmed === '*' || trimmed === 'latest') return ''
  return trimmed.replace(/^[~^]/, '')
}

export function resolveDependencyUrl(
  dependency: NormalizedModuleDependency,
  options: RuntimeResolverOptions = {},
): string {
  const origin = options.origin ?? DEFAULT_ESM_CDN_ORIGIN
  const version = normalizeVersionRange(dependency.version)
  const packageTarget = version ? `${dependency.name}@${version}` : dependency.name
  return `${origin.replace(/\/$/, '')}/${packageTarget}?bundle`
}

function resolveDependencyPrefixUrl(
  dependency: NormalizedModuleDependency,
  options: RuntimeResolverOptions = {},
): string {
  const origin = options.origin ?? DEFAULT_ESM_CDN_ORIGIN
  const version = normalizeVersionRange(dependency.version)
  const packageTarget = version ? `${dependency.name}@${version}` : dependency.name
  return `${origin.replace(/\/$/, '')}/${packageTarget}/`
}

export function createModuleImportMap(
  moduleDefinition: AnyModuleDefinition,
  options: RuntimeResolverOptions = {},
): ModuleImportMap {
  const imports: Record<string, string> = {}

  for (const dependency of normalizeModuleDependencies(moduleDefinition.dependencies)) {
    if (dependency.dev) continue

    const manifestVersion = options.packageJson
      ? getSiteDependencyVersion(options.packageJson, dependency)
      : null
    if (options.strictSiteManifest && !manifestVersion) continue

    const version = manifestVersion ?? dependency.version
    const resolvedDependency = { ...dependency, version }
    imports[dependency.name] = resolveDependencyUrl(resolvedDependency, options)
    imports[`${dependency.name}/`] = resolveDependencyPrefixUrl(resolvedDependency, options)
  }

  return { imports }
}
