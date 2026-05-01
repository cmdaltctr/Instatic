/**
 * Files Data Layer — MIME-driven upload helpers.
 *
 * Architecture source: Contribution #613 §A.1 (Amendment to Contribution #595)
 * Task #431 — Gate 10
 *
 * Provides:
 *   - detectMimeType(mimeType, filePath)  → SiteFileType
 *   - checkSizeLimit(sizeBytes)           → { ok, level, message? }
 *
 * These are pure functions with no store dependency. They are consumed by the
 * CMS media upload UI and any future drag-drop processing.
 *
 * Dependency direction: MUST NOT import from editor/.
 */

import type { SiteFileType } from './types'

// ---------------------------------------------------------------------------
// detectMimeType — map browser File MIME + path extension to SiteFileType
// ---------------------------------------------------------------------------

/**
 * Determine the SiteFileType for an uploaded file.
 *
 * Priority order:
 *   1. Binary asset MIMEs (image/*, video/*, audio/*, font/*) → 'asset'
 *   2. text/css MIME → 'style'
 *   3. Style extensions (.css, .scss, .sass, .less) → 'style'
 *   4. Config filenames/extensions (.json, .env, vite.config.ts, etc.) → 'config'
 *   5. .tsx inside src/components/ → 'component'
 *   6. .tsx/.ts/.js/.jsx (other paths) → 'script'
 *   7. Doc extensions (.md, .txt, .mdx) → 'doc'
 *   8. Fallback → 'asset' (binary or unknown)
 *
 * @param mimeType  Browser-reported MIME type (may be empty or "text/plain")
 * @param filePath  Full relative path e.g. "src/components/Button.tsx"
 */
export function detectMimeType(mimeType: string, filePath: string): SiteFileType {
  const lowerMime = mimeType.toLowerCase()
  const lowerPath = filePath.toLowerCase()

  // 1. Binary asset MIMEs
  if (
    lowerMime.startsWith('image/') ||
    lowerMime.startsWith('video/') ||
    lowerMime.startsWith('audio/') ||
    lowerMime.startsWith('font/')
  ) {
    return 'asset'
  }

  // 2. CSS MIME type (browser reports this for .css files)
  if (lowerMime === 'text/css') {
    return 'style'
  }

  // Extension-based detection (browser MIME is often unreliable for .tsx, .scss)
  const ext = getExtension(lowerPath)
  const filename = getFilename(lowerPath)

  // 3. Style extensions
  if (ext === 'scss' || ext === 'sass' || ext === 'less') {
    return 'style'
  }
  if (ext === 'css') {
    return 'style'
  }

  // 4. Config files with script-like extensions, e.g. vite.config.ts.
  if (isConfigFile(filename, ext)) {
    return 'config'
  }

  // 5. Component: .tsx inside src/components/ (any depth)
  if ((ext === 'tsx' || ext === 'jsx') && isComponentPath(lowerPath)) {
    return 'component'
  }

  // 6. Script: .ts, .tsx, .js, .jsx (not in components/)
  if (ext === 'ts' || ext === 'tsx' || ext === 'js' || ext === 'jsx') {
    return 'script'
  }

  // 7. Documentation
  if (ext === 'md' || ext === 'mdx' || ext === 'txt') {
    return 'doc'
  }

  // 8. Fallback — binary/unknown
  return 'asset'
}

// ---------------------------------------------------------------------------
// checkSizeLimit — soft (10 MB) and hard (50 MB) upload limits
// ---------------------------------------------------------------------------

const SOFT_LIMIT_BYTES = 10 * 1024 * 1024  // 10 MB
const HARD_LIMIT_BYTES = 50 * 1024 * 1024  // 50 MB

export interface SizeLimitResult {
  ok: boolean
  level: 'none' | 'soft' | 'hard'
  message?: string
}

/**
 * Check whether a file size is within acceptable limits.
 *
 * @param sizeBytes  File size in bytes
 * @returns  { ok: true, level: 'none' }          — under 10 MB, no warning
 *           { ok: true, level: 'soft', message }  — 10–49 MB, soft warning
 *           { ok: false, level: 'hard', message } — ≥50 MB, hard limit exceeded
 */
export function checkSizeLimit(sizeBytes: number): SizeLimitResult {
  if (sizeBytes >= HARD_LIMIT_BYTES) {
    return {
      ok: false,
      level: 'hard',
      message: `File exceeds the 50 MB hard limit (${formatBytes(sizeBytes)}). Please reduce the file size before uploading.`,
    }
  }
  if (sizeBytes >= SOFT_LIMIT_BYTES) {
    return {
      ok: true,
      level: 'soft',
      message: `Large file (${formatBytes(sizeBytes)}). Files over 10 MB may slow editor performance.`,
    }
  }
  return { ok: true, level: 'none' }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getExtension(lowerPath: string): string {
  const dot = lowerPath.lastIndexOf('.')
  if (dot === -1) return ''
  return lowerPath.slice(dot + 1)
}

function getFilename(lowerPath: string): string {
  const slash = lowerPath.lastIndexOf('/')
  return slash === -1 ? lowerPath : lowerPath.slice(slash + 1)
}

/**
 * True if the path is inside src/components/ (any depth).
 * Handles both forward-slash and paths that start with src/components/.
 */
function isComponentPath(lowerPath: string): boolean {
  return (
    lowerPath.startsWith('src/components/') ||
    lowerPath.includes('/src/components/')
  )
}

/**
 * True if the filename/extension suggests a site config file.
 * Covers: package.json, tsconfig.json, vite.config.ts, .env, *.config.*, etc.
 */
function isConfigFile(filename: string, ext: string): boolean {
  if (ext === 'json') return true
  if (filename === '.env' || filename.startsWith('.env.')) return true
  if (filename.includes('.config.')) return true
  if (filename === 'vite.config.ts' || filename === 'vite.config.js') return true
  if (filename === 'tailwind.config.js' || filename === 'tailwind.config.ts') return true
  if (filename === 'postcss.config.js' || filename === 'postcss.config.ts') return true
  if (filename === 'babel.config.js' || filename === 'babel.config.ts') return true
  if (filename === '.eslintrc.js' || filename === '.eslintrc.json' || filename === '.eslintrc') return true
  if (filename === '.prettierrc' || filename.startsWith('.prettierrc')) return true
  if (filename === '.gitignore' || filename === '.npmrc') return true
  if (ext === 'toml' || ext === 'yaml' || ext === 'yml') return true
  return false
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}
