import type { SiteDocument } from '@core/page-tree'

/**
 * IPersistenceAdapter — the interface the CMS draft storage backend satisfies.
 */
export interface IPersistenceAdapter {
  /**
   * Persist the single site draft document (shell + pages).
   *
   * `baselinePageIds` is an optimistic-concurrency token: the page ids the
   * client loaded. When supplied, the server only soft-deletes pages the client
   * knew about and dropped — never a page another session created concurrently
   * (ISS-041). Omit it for an authoritative full replace (e.g. import).
   */
  saveSite(site: SiteDocument, baselinePageIds?: string[]): Promise<void>

  /**
   * Load the single site draft document (shell + pages assembled).
   * Returns undefined before setup creates it.
   */
  loadSite(id: string): Promise<SiteDocument | undefined>
}
