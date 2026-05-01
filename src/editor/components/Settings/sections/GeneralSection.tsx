/**
 * GeneralSection — site-level metadata.
 *
 * Fields: site name, meta title, meta description, language, favicon URL.
 * All changes are persisted immediately to the Zustand store and ultimately
 * to the CMS draft via the autosave pipeline.
 *
 * Inputs use onBlur + onKeyDown(Enter) so intermediate keystrokes don't
 * push undo-history entries on every keystroke (performance pattern).
 */
import { useEditorStore } from '../../../../core/editor-store/store'
import { Input, Textarea } from '@ui/components/Input'
import s from '../Settings.module.css'

export function GeneralSection() {
  const site = useEditorStore((state) => state.site)
  const updateSiteName = useEditorStore((state) => state.updateSiteName)
  const updateSiteSettings = useEditorStore((state) => state.updateSiteSettings)

  if (!site) {
    return <div className={s.noSite}>Loading site...</div>
  }

  const { settings } = site

  return (
    <div>
      <h3 className={s.sectionHeading}>General</h3>
      <p className={s.sectionDescription}>
        Site name and HTML metadata used by the published CMS pages.
      </p>

      {/* ── Site name ─────────────────────────────────────────────────────── */}
      <div className={s.genFieldRow}>
        <label htmlFor="gen-proj-name" className={s.label}>
          Site Name
        </label>
        <Input
          id="gen-proj-name"
          type="text"
          defaultValue={site.name}
          onBlur={(e) => {
            const v = e.target.value.trim()
            if (v) updateSiteName(v)
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </div>

      {/* ── Meta Title ────────────────────────────────────────────────────── */}
      <div className={s.genFieldRow}>
        <label htmlFor="gen-meta-title" className={s.label}>
          Meta Title
        </label>
        <Input
          id="gen-meta-title"
          type="text"
          defaultValue={settings.metaTitle ?? ''}
          placeholder="My Website"
          onBlur={(e) =>
            updateSiteSettings({ metaTitle: e.target.value.trim() || undefined })
          }
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </div>

      {/* ── Meta Description ──────────────────────────────────────────────── */}
      <div className={s.genFieldRow}>
        <label htmlFor="gen-meta-desc" className={s.label}>
          Meta Description
        </label>
        <Textarea
          id="gen-meta-desc"
          defaultValue={settings.metaDescription ?? ''}
          placeholder="A short description of your website."
          rows={3}
          onBlur={(e) =>
            updateSiteSettings({ metaDescription: e.target.value.trim() || undefined })
          }
        />
      </div>

      {/* ── Language ──────────────────────────────────────────────────────── */}
      <div className={s.genFieldRow}>
        <label htmlFor="gen-lang" className={s.label}>
          Language
        </label>
        <Input
          id="gen-lang"
          type="text"
          defaultValue={settings.language ?? 'en'}
          placeholder="en"
          onBlur={(e) =>
            updateSiteSettings({ language: e.target.value.trim() || 'en' })
          }
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </div>

      {/* ── Favicon URL ───────────────────────────────────────────────────── */}
      <div className={s.genFieldRow}>
        <label htmlFor="gen-favicon" className={s.label}>
          Favicon URL
        </label>
        <Input
          id="gen-favicon"
          type="url"
          defaultValue={settings.faviconUrl ?? ''}
          placeholder="https://example.com/favicon.ico"
          onBlur={(e) =>
            updateSiteSettings({ faviconUrl: e.target.value.trim() || undefined })
          }
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </div>
    </div>
  )
}
