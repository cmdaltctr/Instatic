import { describe, expect, it } from 'bun:test'
import { findOutletIds, assertSingleOutlet, TemplateOutletError } from '../templateValidation'
import type { Page } from '@core/page-tree'

const page = (moduleIds: string[]): Page => ({
  id: 'p', slug: 'p', title: 'p', rootNodeId: 'r',
  nodes: Object.fromEntries(moduleIds.map((m, i) => [`n${i}`, { id: `n${i}`, moduleId: m, props: {}, breakpointOverrides: {}, children: [] }])),
} as unknown as Page)

describe('outlet validation', () => {
  it('finds the single outlet id', () => {
    expect(findOutletIds(page(['base.body', 'base.outlet']))).toEqual(['n1'])
  })
  it('assertSingleOutlet passes for exactly one', () => {
    expect(() => assertSingleOutlet(['n1'])).not.toThrow()
  })
  it('throws TemplateOutletError for zero outlets', () => {
    expect(() => assertSingleOutlet([])).toThrow(TemplateOutletError)
  })
  it('throws TemplateOutletError for two outlets', () => {
    expect(() => assertSingleOutlet(['a', 'b'])).toThrow(TemplateOutletError)
  })
})
