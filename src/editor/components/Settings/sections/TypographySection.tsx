/**
 * TypographySection — global font import + type scale configuration.
 *
 * - Font Import: paste a Google Fonts CSS @import URL; it will be embedded
 *   as a <link> in all published pages.
 * - Type Scale: choose a base size (px) and a modular-scale ratio; a live
 *   preview renders all 6 canonical steps (xs → 2xl).
 *
 * Both settings persist to `site.settings` through CMS draft autosave.
 *
 * Guideline #326 — Phase 6 Settings Modal: Section-by-Section UX Patterns.
 */
import { useEditorStore } from '../../../../core/editor-store/store'
import type { TypeScale } from '../../../../core/page-tree/types'
import { Input } from '@ui/components/Input'
import { Select } from '@ui/components/Select'
import s from '../Settings.module.css'
import styles from './TypographySection.module.css'

// ─── Type scale presets ───────────────────────────────────────────────────────

const SCALE_PRESETS: Array<{ label: string; ratio: number }> = [
  { label: 'Major Second — 1.125', ratio: 1.125 },
  { label: 'Minor Third — 1.200', ratio: 1.2 },
  { label: 'Major Third — 1.250', ratio: 1.25 },
  { label: 'Perfect Fourth — 1.333', ratio: 1.333 },
  { label: 'Augmented Fourth — 1.414', ratio: 1.414 },
  { label: 'Perfect Fifth — 1.500', ratio: 1.5 },
  { label: 'Golden Ratio — 1.618', ratio: 1.618 },
]

/** Canonical size names aligned with Tailwind / CSS convention */
const STEP_NAMES = ['xs', 'sm', 'base', 'lg', 'xl', '2xl'] as const

/** Compute 6 stepped sizes from base + ratio. Steps: −2 … +3 relative to base. */
function computeSteps(ts: TypeScale) {
  return STEP_NAMES.map((name, i) => {
    const exp = i - 2 // −2 = xs, −1 = sm, 0 = base, 1 = lg, 2 = xl, 3 = 2xl
    const size = Math.round(ts.baseSize * Math.pow(ts.ratio, exp) * 10) / 10
    return { name, size }
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TypographySection() {
  const site = useEditorStore((s) => s.site)
  const updateSiteSettings = useEditorStore((s) => s.updateSiteSettings)

  if (!site) {
    return <div className={styles.noSite}>Loading site...</div>
  }

  const { typeScale, fontImportUrl } = site.settings
  const steps = computeSteps(typeScale)

  return (
    <div>
      <h3 className={s.sectionHeading}>Typography</h3>
      <p className={s.sectionDescription}>
        Global font imports and modular type scale for the site.
      </p>

      {/* ── Font Import ───────────────────────────────────────────────────── */}
      <section aria-labelledby="typo-font-heading" className={styles.fontSection}>
        <h4 id="typo-font-heading" className={s.subHeading}>
          Font Import
        </h4>

        <label htmlFor="typo-font-url" className={s.label}>
          Google Fonts URL
          <span className={styles.fontUrl}>
            paste the link from fonts.google.com
          </span>
        </label>
        <Input
          id="typo-font-url"
          type="url"
          defaultValue={fontImportUrl ?? ''}
          placeholder="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap"
          onBlur={(e) =>
            updateSiteSettings({ fontImportUrl: e.target.value.trim() || undefined })
          }
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        {fontImportUrl && (
          <p className={styles.fontNote}>
            Font loaded. Reference the family name (e.g.{' '}
            <code>font-family: 'Inter', sans-serif</code>) in
            the CSS class editor.
          </p>
        )}
      </section>

      {/* ── Type Scale ────────────────────────────────────────────────────── */}
      <section aria-labelledby="typo-scale-heading">
        <h4 id="typo-scale-heading" className={s.subHeading}>
          Type Scale
        </h4>

        <div className={styles.typeScaleControls}>
          {/* Base size */}
          <div className={styles.baseSizeWrap}>
            <label htmlFor="typo-base-size" className={s.label}>
              Base size (px)
            </label>
            <Input
              id="typo-base-size"
              type="number"
              min={10}
              max={32}
              step={1}
              defaultValue={typeScale.baseSize}
              onBlur={(e) => {
                const v = Number(e.target.value)
                if (v >= 10 && v <= 32) {
                  updateSiteSettings({ typeScale: { ...typeScale, baseSize: v } })
                }
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              aria-label="Base font size in pixels"
            />
          </div>

          {/* Ratio */}
          <div className={styles.ratioWrap}>
            <label htmlFor="typo-ratio" className={s.label}>
              Scale ratio
            </label>
            <Select
              id="typo-ratio"
              value={typeScale.ratio}
              onChange={(e) =>
                updateSiteSettings({
                  typeScale: { ...typeScale, ratio: parseFloat(e.target.value) },
                })
              }
              aria-label="Type scale ratio preset"
            >
              {SCALE_PRESETS.map((p) => (
                <option key={p.ratio} value={p.ratio}>
                  {p.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* Live scale preview */}
        <div
          role="group"
          aria-label="Type scale preview"
          className={styles.scalePreview}
        >
          {steps.map(({ name, size }) => (
            <div
              key={name}
              className={styles.scaleRow}
            >
              <span className={styles.scaleRowName}>
                {name}
              </span>
              <span className={styles.scaleRowSize}>
                {size}px
              </span>
              {/*
                Dynamic font-size from computed type scale — CSS custom property used so
                the style prop only sets a var, not a design value. fontSize changes as the
                user adjusts baseSize/ratio and cannot be expressed as a static CSS class.
              */}
              <span
                aria-hidden="true"
                style={{ '--preview-fs': `${Math.min(size, 32)}px` } as React.CSSProperties}
                className={styles.scaleRowPreview}
              >
                Aa
              </span>
            </div>
          ))}
        </div>

        <p className={styles.scaleNote}>
          These sizes are a reference — apply them manually in the CSS class editor
          (e.g.{' '}
          <code>font-size: {steps[2].size}px</code>).
        </p>
      </section>
    </div>
  )
}
