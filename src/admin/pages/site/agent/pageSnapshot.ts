/**
 * Pure page-snapshot builder.
 *
 * Maps a persisted `Page` + `SiteDocument` (+ module registry) into the
 * `PageContext` snapshot the agent's read tools consume. It is deliberately
 * free of any editor-store / browser coupling: the only editor-only inputs are
 * the two scalars `selectedNodeId` and `activeBreakpointId`, passed in via
 * `options`.
 *
 * This is the single source of truth for the JSON page payload. `buildPageContext`
 * (the editor adapter) and the token benchmark both call it, so the benchmark
 * measures exactly what the agent receives and cannot drift from it.
 */

import type {
  AnyModuleDefinition,
  IModuleRegistry,
  PropertyControl,
  PropertySchema,
} from '@core/module-engine'
import { describeFrameworkTokens } from '@core/framework'
import { describeFontTokens } from '@core/fonts'
import type { Page, SiteDocument } from '@core/page-tree'
import type {
  AgentModuleContext,
  AgentModulePropContext,
  AgentModuleStyleContext,
  PageContext,
} from './types'

export interface PageSnapshotOptions {
  /** Currently selected node id in the editor, if any. */
  selectedNodeId: string | null
  /** Breakpoint id currently active in the editor. */
  activeBreakpointId: string
}

/**
 * Build the `PageContext` snapshot for a single page. Pure: same inputs →
 * same output, no store/DOM access.
 */
export function buildPageSnapshot(
  page: Page,
  site: SiteDocument,
  registry: IModuleRegistry,
  options: PageSnapshotOptions,
): PageContext {
  const parentMap: Record<string, string | null> = {}
  for (const node of Object.values(page.nodes)) {
    for (const childId of node.children) {
      parentMap[childId] = node.id
    }
    if (!parentMap[node.id]) parentMap[node.id] = null
  }

  const nodes = Object.values(page.nodes).map((node) => ({
    id: node.id,
    moduleId: node.moduleId,
    label: node.label,
    parentId: parentMap[node.id] ?? null,
    children: node.children,
    props: node.props,
    breakpointOverrides: toSerializableBreakpointRecords(node.breakpointOverrides ?? {}),
    classIds: node.classIds ?? [],
  }))

  const availableModules = registry
    .list()
    .filter((mod) => mod.id !== 'base.body')
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(moduleDefinitionToAgentContext)

  // The agent works in terms of viewport contexts; surface only the
  // breakpoint-keyed subset of the unified contextStyles map. Custom @media /
  // @container / @supports conditions are not part of the agent's model yet.
  const breakpointIds = new Set(site.breakpoints.map((bp) => bp.id))
  const classes = Object.values(site.styleRules ?? {}).map((c) => {
    const breakpointStyles: Record<string, Record<string, unknown>> = {}
    for (const [contextId, bag] of Object.entries(c.contextStyles ?? {})) {
      if (breakpointIds.has(contextId)) breakpointStyles[contextId] = bag
    }
    return {
      id: c.id,
      name: c.name,
      styles: toSerializableRecord(c.styles ?? {}),
      breakpointStyles: toSerializableBreakpointStyles(breakpointStyles),
      ...(c.generated ? { generated: c.generated.family } : {}),
    }
  })

  const pages = site.pages.map((p) => ({
    id: p.id,
    title: p.title,
    slug: p.slug,
    active: p.id === page.id,
    isHomepage: p.slug === 'index',
  }))

  return {
    pageId: page.id,
    pageTitle: page.title,
    rootNodeId: page.rootNodeId,
    pages,
    activeBreakpointId: options.activeBreakpointId,
    breakpoints: site.breakpoints.map((breakpoint) => ({
      id: breakpoint.id,
      label: breakpoint.label,
      width: breakpoint.width,
      mediaQuery: breakpoint.mediaQuery,
      icon: breakpoint.icon,
    })),
    nodes,
    availableModules,
    selectedNodeId: options.selectedNodeId,
    classes,
    tokens: {
      ...describeFrameworkTokens(site.settings.framework),
      fonts: describeFontTokens(site.settings.fonts),
    },
  }
}

function moduleDefinitionToAgentContext(mod: AnyModuleDefinition): AgentModuleContext {
  return {
    id: mod.id,
    name: mod.name,
    description: mod.description,
    category: mod.category,
    canHaveChildren: mod.canHaveChildren,
    defaults: toSerializableRecord(mod.defaults ?? {}),
    props: schemaToAgentProps(mod.schema, mod.defaults ?? {}),
    styles: genericAgentStyleHintsForModule(mod),
  }
}

function genericAgentStyleHintsForModule(mod: AnyModuleDefinition): AgentModuleStyleContext[] {
  if (mod.id === 'base.text' || mod.category.toLowerCase() === 'typography') {
    return [
      { key: 'fontFamily', type: 'text', label: 'Font family', defaultValue: 'inherit', cssProperties: ['fontFamily'] },
      { key: 'fontSize', type: 'text', label: 'Font size', defaultValue: '16px', cssProperties: ['fontSize'] },
      { key: 'fontWeight', type: 'select', label: 'Font weight', defaultValue: '400', cssProperties: ['fontWeight'], options: [
        { label: 'Regular', value: '400' },
        { label: 'Medium', value: '500' },
        { label: 'Semi bold', value: '600' },
        { label: 'Bold', value: '700' },
        { label: 'Black', value: '900' },
      ] },
      { key: 'lineHeight', type: 'text', label: 'Line height', defaultValue: '1.4', cssProperties: ['lineHeight'] },
      { key: 'letterSpacing', type: 'text', label: 'Letter spacing', defaultValue: '0px', cssProperties: ['letterSpacing'] },
      { key: 'color', type: 'color', label: 'Text color', defaultValue: 'inherit', cssProperties: ['color'] },
      { key: 'textAlign', type: 'select', label: 'Text align', defaultValue: 'left', cssProperties: ['textAlign'], options: [
        { label: 'Left', value: 'left' },
        { label: 'Center', value: 'center' },
        { label: 'Right', value: 'right' },
        { label: 'Justify', value: 'justify' },
      ] },
      { key: 'marginBottom', type: 'text', label: 'Bottom margin', defaultValue: '0px', cssProperties: ['marginBottom'] },
    ]
  }

  return []
}

function schemaToAgentProps(
  schema: PropertySchema,
  defaults: Record<string, unknown>,
): AgentModulePropContext[] {
  const props: AgentModulePropContext[] = []

  for (const [key, control] of Object.entries(schema)) {
    if (control.type === 'group') {
      props.push(...schemaToAgentProps(control.children, defaults))
      continue
    }
    props.push(controlToAgentProp(key, control, defaults[key]))
  }

  return props
}

function controlToAgentProp(
  key: string,
  control: Exclude<PropertyControl, { type: 'group' }>,
  defaultValue: unknown,
): AgentModulePropContext {
  const prop: AgentModulePropContext = {
    key,
    type: control.type,
    label: control.label,
    description: control.description,
    defaultValue: toSerializableValue(defaultValue),
  }

  if (control.breakpointOverridable === true) {
    prop.breakpointOverridable = true
  }

  if (control.type === 'select') {
    prop.options = control.options.map((option) => ({
      label: option.label,
      value: toSerializableValue(option.value),
    }))
  }

  return prop
}

function toSerializableRecord(record: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    result[key] = toSerializableValue(value)
  }
  return result
}

function toSerializableBreakpointStyles(
  breakpointStyles: Record<string, Record<string, unknown>>,
): Record<string, Record<string, unknown>> {
  return toSerializableBreakpointRecords(breakpointStyles)
}

function toSerializableBreakpointRecords(
  breakpointStyles: Record<string, Partial<Record<string, unknown>>>,
): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {}
  for (const [breakpointId, styles] of Object.entries(breakpointStyles)) {
    result[breakpointId] = toSerializableRecord(styles)
  }
  return result
}

function toSerializableValue(value: unknown): unknown {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }

  if (Array.isArray(value)) return value.map(toSerializableValue)

  if (typeof value === 'object' && value) {
    const result: Record<string, unknown> = {}
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      result[key] = toSerializableValue(nestedValue)
    }
    return result
  }

  return String(value)
}
