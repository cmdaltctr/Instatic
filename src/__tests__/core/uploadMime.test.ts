/**
 * Task #431 / Contribution #613 §A.1 — MIME-driven type detection
 *
 * WHY THESE GATES EXIST
 * ─────────────────────
 * Architecture Amendment #613 §A.1 requires a MIME-driven helper at
 * `src/core/files/upload.ts` that maps browser File objects (mime type + path)
 * to the correct `SiteFileType` and content strategy.
 *
 * User directive #1870: "upload files there, upload images there, create
 * components which we can open in the canvas" — the detection logic is the
 * foundation for reliable uploads.
 *
 * ── Branch map (one test per branch) ─────────────────────────────────────────
 *
 *   Branch 1  — image/* MIME     → type: 'asset', content via blob
 *   Branch 2  — video/* MIME     → type: 'asset', content via blob
 *   Branch 3  — audio/* MIME     → type: 'asset', content via blob
 *   Branch 4  — font/* MIME      → type: 'asset', content via blob
 *   Branch 5  — text/css MIME    → type: 'style', content as text
 *   Branch 6  — .scss extension  → type: 'style', content as text
 *   Branch 7  — .tsx in src/components/ → type: 'component'
 *   Branch 8  — .tsx NOT in src/components/ → type: 'script'
 *   Branch 9  — .ts extension    → type: 'script'
 *   Branch 10 — .json non-package.json → type: 'config'
 *   Branch 11 — package.json     → type: 'config' (still config, but not script)
 *   Branch 12 — .md extension    → type: 'doc'
 *   Branch 13 — .txt extension   → type: 'doc'
 *   Branch 14 — unknown MIME     → type: 'asset', blob fallback
 *
 * ── Size-limit enforcement ────────────────────────────────────────────────────
 *
 *   Gate SL-1 — files < 10 MB pass with no warning
 *   Gate SL-2 — files ≥ 10 MB and < 50 MB: resolves with a 'soft_limit' warning
 *   Gate SL-3 — files ≥ 50 MB: throws / rejects with a hard-limit error
 *
 * ── Collision-replace dialog (path collision) ─────────────────────────────────
 *
 *   Gate COL-1 — detectMimeType does NOT enforce path uniqueness (that's the
 *                slice boundary's job); helper only returns type metadata.
 *
 * All gates FAIL until `src/core/files/upload.ts` is implemented.
 *
 * @see src/core/files/upload.ts          — not yet implemented (will go green)
 * @see Contribution #613 §A.1            — MIME detection spec
 * @see src/core/files/types.ts           — SiteFileType
 * @see Site Explorer asset upload
 * @see Constraint #436 — isSafePath() must be called at slice write boundary
 */

import { describe, it, expect } from 'bun:test'

// ---------------------------------------------------------------------------
// Import under test — will fail (module not found) until upload.ts exists
// ---------------------------------------------------------------------------

let detectMimeType: (mimeType: string, filePath: string) => import('../../core/files/types').SiteFileType
let checkSizeLimit: (sizeBytes: number) => { ok: boolean; level: 'none' | 'soft' | 'hard'; message?: string }

try {
   
  const mod = require('../../core/files/upload')
  detectMimeType = mod.detectMimeType
  checkSizeLimit = mod.checkSizeLimit
} catch {
  // Module not yet implemented — tests will fail as expected
  detectMimeType = undefined as unknown as typeof detectMimeType
  checkSizeLimit = undefined as unknown as typeof checkSizeLimit
}

// ---------------------------------------------------------------------------
// Helper to fail clearly if the module is absent
// ---------------------------------------------------------------------------

function requireImpl(name: string, fn: unknown): asserts fn is NonNullable<typeof fn> {
  if (!fn) {
    throw new Error(
      `[upload.ts not implemented] \`${name}\` is not exported from src/core/files/upload.ts.\n` +
      'Implement the module and export this function to make this gate green.',
    )
  }
}

// ============================================================================
// Gate 1-4 — Binary / asset MIME types
// ============================================================================

describe('detectMimeType — image/* branch (Gate 1)', () => {
  it('image/png → asset', () => {
    requireImpl('detectMimeType', detectMimeType)
    expect(detectMimeType('image/png', 'public/logo.png')).toBe('asset')
  })

  it('image/jpeg → asset', () => {
    requireImpl('detectMimeType', detectMimeType)
    expect(detectMimeType('image/jpeg', 'public/photo.jpg')).toBe('asset')
  })

  it('image/svg+xml → asset', () => {
    requireImpl('detectMimeType', detectMimeType)
    expect(detectMimeType('image/svg+xml', 'public/icon.svg')).toBe('asset')
  })

  it('image/gif → asset', () => {
    requireImpl('detectMimeType', detectMimeType)
    expect(detectMimeType('image/gif', 'public/anim.gif')).toBe('asset')
  })

  it('image/webp → asset', () => {
    requireImpl('detectMimeType', detectMimeType)
    expect(detectMimeType('image/webp', 'public/img.webp')).toBe('asset')
  })
})

describe('detectMimeType — video/* branch (Gate 2)', () => {
  it('video/mp4 → asset', () => {
    requireImpl('detectMimeType', detectMimeType)
    expect(detectMimeType('video/mp4', 'public/hero.mp4')).toBe('asset')
  })

  it('video/webm → asset', () => {
    requireImpl('detectMimeType', detectMimeType)
    expect(detectMimeType('video/webm', 'public/demo.webm')).toBe('asset')
  })
})

describe('detectMimeType — audio/* branch (Gate 3)', () => {
  it('audio/mpeg → asset', () => {
    requireImpl('detectMimeType', detectMimeType)
    expect(detectMimeType('audio/mpeg', 'public/sound.mp3')).toBe('asset')
  })

  it('audio/wav → asset', () => {
    requireImpl('detectMimeType', detectMimeType)
    expect(detectMimeType('audio/wav', 'public/click.wav')).toBe('asset')
  })
})

describe('detectMimeType — font/* branch (Gate 4)', () => {
  it('font/woff2 → asset', () => {
    requireImpl('detectMimeType', detectMimeType)
    expect(detectMimeType('font/woff2', 'public/fonts/Inter.woff2')).toBe('asset')
  })

  it('font/ttf → asset', () => {
    requireImpl('detectMimeType', detectMimeType)
    expect(detectMimeType('font/ttf', 'public/fonts/Inter.ttf')).toBe('asset')
  })
})

// ============================================================================
// Gate 5-6 — Style MIME types
// ============================================================================

describe('detectMimeType — text/css MIME branch (Gate 5)', () => {
  it('text/css → style', () => {
    requireImpl('detectMimeType', detectMimeType)
    expect(detectMimeType('text/css', 'src/styles/globals.css')).toBe('style')
  })

  it('text/css MIME overrides extension if somehow mismatch', () => {
    requireImpl('detectMimeType', detectMimeType)
    // MIME wins for text/css because the browser provides the authoritative type
    expect(detectMimeType('text/css', 'src/styles/foo')).toBe('style')
  })
})

describe('detectMimeType — .scss extension branch (Gate 6)', () => {
  it('.scss extension → style (MIME is usually text/plain from browser)', () => {
    requireImpl('detectMimeType', detectMimeType)
    // Browser often sends text/plain for .scss — must fall back to extension check
    expect(detectMimeType('text/plain', 'src/styles/button.scss')).toBe('style')
  })

  it('.sass extension → style', () => {
    requireImpl('detectMimeType', detectMimeType)
    expect(detectMimeType('text/plain', 'src/styles/layout.sass')).toBe('style')
  })
})

// ============================================================================
// Gate 7-9 — Component vs script (path-based disambiguation)
// ============================================================================

describe('detectMimeType — .tsx in src/components/ → component (Gate 7)', () => {
  it('src/components/Button.tsx → component', () => {
    requireImpl('detectMimeType', detectMimeType)
    expect(detectMimeType('application/typescript', 'src/components/Button.tsx')).toBe('component')
  })

  it('src/components/ui/Card.tsx → component', () => {
    requireImpl('detectMimeType', detectMimeType)
    expect(detectMimeType('text/typescript', 'src/components/ui/Card.tsx')).toBe('component')
  })

  it('src/components/Button.tsx with text/plain MIME → component', () => {
    requireImpl('detectMimeType', detectMimeType)
    // Browsers often report .tsx as text/plain — extension + path must win
    expect(detectMimeType('text/plain', 'src/components/Button.tsx')).toBe('component')
  })
})

describe('detectMimeType — .tsx NOT in src/components/ → script (Gate 8)', () => {
  it('src/App.tsx → script (not in components/)', () => {
    requireImpl('detectMimeType', detectMimeType)
    expect(detectMimeType('text/plain', 'src/App.tsx')).toBe('script')
  })

  it('src/lib/theme.tsx → script', () => {
    requireImpl('detectMimeType', detectMimeType)
    expect(detectMimeType('text/plain', 'src/lib/theme.tsx')).toBe('script')
  })
})

describe('detectMimeType — .ts extension → script (Gate 9)', () => {
  it('.ts file → script', () => {
    requireImpl('detectMimeType', detectMimeType)
    expect(detectMimeType('text/plain', 'src/hooks/useTheme.ts')).toBe('script')
  })

  it('.js file → script', () => {
    requireImpl('detectMimeType', detectMimeType)
    expect(detectMimeType('text/javascript', 'src/utils/helpers.js')).toBe('script')
  })

  it('.jsx file → script (not in components/)', () => {
    requireImpl('detectMimeType', detectMimeType)
    expect(detectMimeType('text/plain', 'src/utils/legacy.jsx')).toBe('script')
  })
})

// ============================================================================
// Gate 10-11 — Config files
// ============================================================================

describe('detectMimeType — .json non-package.json → config (Gate 10)', () => {
  it('tsconfig.json → config', () => {
    requireImpl('detectMimeType', detectMimeType)
    expect(detectMimeType('application/json', 'tsconfig.json')).toBe('config')
  })

  it('vite.config.ts → config', () => {
    requireImpl('detectMimeType', detectMimeType)
    // Treat vite.config.ts as config not script
    expect(detectMimeType('text/plain', 'vite.config.ts')).toBe('config')
  })

  it('.env file → config', () => {
    requireImpl('detectMimeType', detectMimeType)
    expect(detectMimeType('text/plain', '.env')).toBe('config')
  })

  it('nested config.json → config', () => {
    requireImpl('detectMimeType', detectMimeType)
    expect(detectMimeType('application/json', 'src/app.config.json')).toBe('config')
  })
})

describe('detectMimeType — package.json → config (Gate 11)', () => {
  it('package.json → config (not script)', () => {
    requireImpl('detectMimeType', detectMimeType)
    const result = detectMimeType('application/json', 'package.json')
    expect(result).toBe('config')
    // Ensure it does NOT accidentally classify as script
    expect(result).not.toBe('script')
  })
})

// ============================================================================
// Gate 12-13 — Documentation files
// ============================================================================

describe('detectMimeType — .md extension → doc (Gate 12)', () => {
  it('README.md → doc', () => {
    requireImpl('detectMimeType', detectMimeType)
    expect(detectMimeType('text/markdown', 'README.md')).toBe('doc')
  })

  it('docs/SETUP.md → doc', () => {
    requireImpl('detectMimeType', detectMimeType)
    expect(detectMimeType('text/plain', 'docs/SETUP.md')).toBe('doc')
  })
})

describe('detectMimeType — .txt extension → doc (Gate 13)', () => {
  it('.txt file → doc', () => {
    requireImpl('detectMimeType', detectMimeType)
    expect(detectMimeType('text/plain', 'NOTES.txt')).toBe('doc')
  })
})

// ============================================================================
// Gate 14 — Unknown MIME fallback
// ============================================================================

describe('detectMimeType — unknown MIME → asset fallback (Gate 14)', () => {
  it('application/octet-stream → asset', () => {
    requireImpl('detectMimeType', detectMimeType)
    expect(detectMimeType('application/octet-stream', 'public/data.bin')).toBe('asset')
  })

  it('completely unknown MIME → asset', () => {
    requireImpl('detectMimeType', detectMimeType)
    expect(detectMimeType('application/x-some-unknown-type', 'public/mystery.xyz')).toBe('asset')
  })

  it('empty MIME string → asset', () => {
    requireImpl('detectMimeType', detectMimeType)
    // When the browser reports no MIME type at all, fall back to asset
    expect(detectMimeType('', 'public/unknown')).toBe('asset')
  })
})

// ============================================================================
// Size-limit enforcement gates
// ============================================================================

const MB = 1024 * 1024

describe('checkSizeLimit — soft limit (Gate SL-1 + SL-2)', () => {
  it('file under 10 MB: ok=true, level=none (Gate SL-1)', () => {
    requireImpl('checkSizeLimit', checkSizeLimit)
    const result = checkSizeLimit(5 * MB) // 5 MB
    expect(result.ok).toBe(true)
    expect(result.level).toBe('none')
  })

  it('file exactly at 1 byte under 10 MB: ok=true, level=none', () => {
    requireImpl('checkSizeLimit', checkSizeLimit)
    const result = checkSizeLimit(10 * MB - 1)
    expect(result.ok).toBe(true)
    expect(result.level).toBe('none')
  })

  it('file exactly at 10 MB: ok=true with soft warning (Gate SL-2)', () => {
    requireImpl('checkSizeLimit', checkSizeLimit)
    const result = checkSizeLimit(10 * MB)
    expect(result.ok).toBe(true)
    expect(result.level).toBe('soft')
    expect(result.message).toBeTruthy()
  })

  it('file at 30 MB: ok=true with soft warning', () => {
    requireImpl('checkSizeLimit', checkSizeLimit)
    const result = checkSizeLimit(30 * MB)
    expect(result.ok).toBe(true)
    expect(result.level).toBe('soft')
  })

  it('file at 1 byte under 50 MB: ok=true with soft warning', () => {
    requireImpl('checkSizeLimit', checkSizeLimit)
    const result = checkSizeLimit(50 * MB - 1)
    expect(result.ok).toBe(true)
    expect(result.level).toBe('soft')
  })
})

describe('checkSizeLimit — hard limit (Gate SL-3)', () => {
  it('file at exactly 50 MB: ok=false, level=hard (Gate SL-3)', () => {
    requireImpl('checkSizeLimit', checkSizeLimit)
    const result = checkSizeLimit(50 * MB)
    expect(result.ok).toBe(false)
    expect(result.level).toBe('hard')
    expect(result.message).toBeTruthy()
  })

  it('file at 100 MB: ok=false, level=hard', () => {
    requireImpl('checkSizeLimit', checkSizeLimit)
    const result = checkSizeLimit(100 * MB)
    expect(result.ok).toBe(false)
    expect(result.level).toBe('hard')
  })

  it('hard limit error message names the limit (50 MB)', () => {
    requireImpl('checkSizeLimit', checkSizeLimit)
    const result = checkSizeLimit(60 * MB)
    expect(result.message).toMatch(/50.?MB/i)
  })
})
