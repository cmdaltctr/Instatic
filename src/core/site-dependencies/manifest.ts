import { isSafePackageName } from './packageNames'

export interface SitePackageJson {
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}

export const DEFAULT_SITE_PACKAGE_JSON: SitePackageJson = {
  dependencies: {
    react: '^18.2.0',
    'react-dom': '^18.2.0',
  },
  devDependencies: {
    '@types/react': '^18.2.0',
    '@types/react-dom': '^18.2.0',
    '@vitejs/plugin-react': '^4.3.0',
    typescript: '^5.3.0',
    vite: '^5.1.0',
  },
}

export function clonePackageJson(
  packageJson: SitePackageJson = DEFAULT_SITE_PACKAGE_JSON,
): SitePackageJson {
  return {
    dependencies: { ...packageJson.dependencies },
    devDependencies: { ...packageJson.devDependencies },
  }
}

function normalizeDependencyMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}

  const normalized: Record<string, string> = {}
  for (const [rawName, rawVersion] of Object.entries(raw as Record<string, unknown>)) {
    const name = rawName.trim()
    const version = typeof rawVersion === 'string' ? rawVersion.trim() : ''
    if (!name || !version || !isSafePackageName(name)) continue
    normalized[name] = version
  }
  return normalized
}

export function normalizeSitePackageJson(raw: unknown): SitePackageJson {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return clonePackageJson()
  }

  const manifest = raw as Record<string, unknown>
  return {
    dependencies: {
      ...DEFAULT_SITE_PACKAGE_JSON.dependencies,
      ...normalizeDependencyMap(manifest.dependencies),
    },
    devDependencies: {
      ...DEFAULT_SITE_PACKAGE_JSON.devDependencies,
      ...normalizeDependencyMap(manifest.devDependencies),
    },
  }
}

export function mergeWithDefaultPackageJson(
  packageJson?: SitePackageJson,
): SitePackageJson {
  return {
    dependencies: {
      ...DEFAULT_SITE_PACKAGE_JSON.dependencies,
      ...(packageJson?.dependencies ?? {}),
    },
    devDependencies: {
      ...DEFAULT_SITE_PACKAGE_JSON.devDependencies,
      ...(packageJson?.devDependencies ?? {}),
    },
  }
}
