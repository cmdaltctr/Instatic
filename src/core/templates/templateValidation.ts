import type { Page } from '@core/page-tree'

/** Thrown when a template tree does not contain exactly one base.outlet. */
export class TemplateOutletError extends Error {
  constructor(readonly count: number) {
    super(`A template must contain exactly one base.outlet (found ${count}).`)
    this.name = 'TemplateOutletError'
  }
}

export function findOutletIds(page: Page): string[] {
  const ids: string[] = []
  for (const id in page.nodes) if (page.nodes[id].moduleId === 'base.outlet') ids.push(id)
  return ids
}

export function assertSingleOutlet(outletIds: string[]): void {
  if (outletIds.length !== 1) throw new TemplateOutletError(outletIds.length)
}
