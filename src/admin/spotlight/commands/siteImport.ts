/**
 * Site Import command — open the Super Import wizard from the Spotlight palette.
 *
 * Capability gate mirrors editor.save: any user who holds at least one
 * site-write capability can use this command.
 */

import type { Command } from '../types'

/** Mirrors SITE_WRITE_CAPABILITIES in editor.ts — any holder can import a site. */
const SITE_WRITE_CAPABILITIES = [
  'site.structure.edit',
  'site.content.edit',
  'site.style.edit',
] as const

export function getSiteImportCommands(): Command[] {
  return [
    {
      id: 'editor.importSite',
      title: 'Import Site',
      subtitle: 'Import pages from a folder, files, or .zip archive',
      group: 'editor',
      iconName: 'files-stack-2-solid',
      keywords: ['import', 'site', 'zip', 'folder', 'bundle', 'html', 'css'],
      workspaces: ['site'],
      capability: SITE_WRITE_CAPABILITIES,
      run: async (ctx) => {
        ctx.closeSpotlight()
        // Lazy import to avoid pulling the editor store into non-site bundles.
        const { useEditorStore } = await import('@site/store/store')
        useEditorStore.getState().openSiteImportModal()
      },
    },
  ]
}
