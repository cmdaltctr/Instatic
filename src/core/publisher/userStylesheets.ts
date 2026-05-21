/**
 * User-authored stylesheets collector.
 *
 * The Site panel's "Styles" section lets authors create CSS files that live in
 * `site.files` with `type: 'style'`. This helper concatenates their content in
 * stable, predictable order so it can drop straight into:
 *
 *  - the published page's `userStyles` CSS bundle (`siteCssBundle.ts`)
 *  - the editor canvas's user-CSS `<style>` tag (`UserStylesheetInjector.tsx`)
 *
 * Both consumers need the *same* concatenated string so what authors see in
 * the canvas matches what their visitors get on the live site.
 *
 * Sort order is by `path` (ASCII, ascending). Authors can reason about
 * intra-stylesheet specificity ties from the filename alone — no implicit
 * "most-recently-edited wins" surprises.
 */

import type { SiteDocument } from '@core/page-tree'

export function collectUserStylesheetCss(site: SiteDocument): string {
  // Guard against fixtures / partial sites that don't supply `files`. The
  // SiteDocument schema declares `files: SiteFile[]`, but legacy test fixtures
  // and some import paths construct sites without it. Treat absent as empty
  // — same observable behaviour as "no user stylesheets defined".
  if (!Array.isArray(site.files)) return ''

  const files = site.files
    .filter((file) => file.type === 'style' && typeof file.content === 'string' && file.content.length > 0)
    .sort((a, b) => a.path.localeCompare(b.path))

  if (files.length === 0) return ''

  // Comment-wrap each file body with its source path so DevTools / `view-source`
  // makes the origin obvious. The wrapper is ~80 bytes of fixed overhead per
  // file — trivial relative to a typical user stylesheet.
  return files
    .map((file) => `/* ${escapeCommentPath(file.path)} */\n${file.content}`)
    .join('\n\n')
}

/**
 * Sanitise a path so it cannot close the surrounding CSS comment block.
 * The only sequence that would break out is the asterisk-slash pair itself
 * — replace any accidental occurrences with `*\/` (visually identical, but
 * no longer a comment terminator). All other characters are safe inside a
 * CSS comment.
 */
function escapeCommentPath(path: string): string {
  return path.replace(/\*\//g, '*\\/')
}
