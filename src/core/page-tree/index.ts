// ---------------------------------------------------------------------------
// Barrel — the canonical public API for the page-tree module.
//
// Everything outside `src/core/page-tree/` MUST import from `@core/page-tree`.
// Direct deep imports (`@core/page-tree/<file>`) are reserved for internal
// cross-references within the module itself — they exist so internal files
// don't go through the barrel and create import cycles. CLAUDE.md documents
// this pattern.
// ---------------------------------------------------------------------------

// Schemas — exported as both runtime constants (for `parseValue` / `Value.Check`)
// and types (via Static<typeof X>).
export { BaseNodeSchema, parsePropBindings } from './baseNode'
export { NodeTreeSchema } from './treeSchema'
export { PageNodeSchema } from './pageNode'
export {
  TreeOperationSchema,
  TreeMutateResultSchema,
  assertValidNodeTree,
  parsePageNodeTree,
} from './operationSchema'
export { PageSchema } from './page'
export { StyleRuleSchema, StyleRuleKindSchema, classKindSelector, parseStyleRule } from './styleRule'
export { ConditionSchema, ConditionDefSchema } from './condition'
export { SiteShellSchema } from './siteDocument'

// Types — derived from schemas. Schemas are the source of truth.
export type { Breakpoint } from './breakpoint'
export type { DynamicPropBinding } from './dynamicBinding'
export type { PageTemplateConfig } from './pageTemplate'
export type { PageNode } from './pageNode'
export type { TreeOperation, TreeMutateResult } from './operationSchema'
export type { Page } from './page'
export type { CSSPropertyBag } from './cssPropertyBag'
export type { StyleRule, StyleRuleKind } from './styleRule'
export type { Condition, ConditionDef } from './condition'
export type { SiteSettings } from './siteSettings'
export type { SiteShell, SiteDocument } from './siteDocument'

// Defaults
export { DEFAULT_BREAKPOINTS } from './breakpoint'
export { DEFAULT_SITE_SETTINGS } from './siteSettings'

// Condition helpers
export { conditionId, conditionLabel, sameCondition, makeConditionDef, parseConditions } from './condition'

// Tolerant parsers — boundary helpers for persisted data.
export { parsePage } from './page'
export { parseSiteDocument } from './siteDocument'

// Slug → public path + internal page-reference links.
export {
  normalizePageSlug,
  pageSlugError,
  pageSlugDuplicateError,
  createUniquePageSlug,
  pagePublicPath,
  isHomePage,
  findHomePage,
} from './slugs'
export {
  PAGE_REF_PREFIX,
  makePageRef,
  isPageRef,
  parsePageRef,
  resolvePageRef,
} from './pageRef'
export type { ParsedPageRef } from './pageRef'

// Other re-exports unrelated to the schemas split
export type { FontEntry } from '@core/fonts/schemas'

export type { BaseNode } from './baseNode'

export type { NodeTree } from './treeSchema'

export type {
  FrameworkColorToken,
  FrameworkColorUtilityType,
  FrameworkPreferencesSettings,
  FrameworkScaleManualSize,
  FrameworkScaleMode,
  FrameworkSpacingClassGenerator,
  FrameworkSpacingGroup,
  FrameworkTypographyClassGenerator,
  FrameworkTypographyGroup,
} from '@core/framework/schemas'

export {
  createNode,
  insertNode,
  deleteNode,
  updateNodeProps,
  setBreakpointOverride,
  clearBreakpointOverride,
  renameNode,
  toggleNodeLocked,
  toggleNodeHidden,
  moveNode,
  moveNodes,
  duplicateNode,
  buildSubtreeNodeIdMap,
  pasteSubtree,
  wrapNode,
  wrapNodes,
  addPage,
  deletePage,
  renamePage,
  reorderPages,
  duplicatePage,
  applyTreeOperation,
} from './mutations'

export type { ApplyTreeOperationResult } from './mutations'

export { cloneScopedClassesForNodeMap } from './scopedClassClone'

export {
  getNode,
  getNodeOrThrow,
  getChildren,
  getParent,
  getAncestors,
  flattenSubtree,
  isAncestor,
  resolveProps,
  evaluateCondition,
} from './selectors'

export {
  assertValidCssClassName,
  styleRuleSelector,
  classNamesForClassIds,
  escapeCssIdentifier,
} from './classNames'
export type { StyleRuleRegistry } from './classNames'

export {
  isUserVisibleClass,
  isGeneratedClass,
  isGeneratedClassLocked,
  generatedClassKindLabel,
} from './classUtils'

export { getNodeDisplayName, getNodeHtmlTag, getNodeClassNames } from './nodeDisplayName'

export { resolvePageTreeDropTarget } from './dnd'
export type { PageTreeDropPosition, PageTreeDropTarget } from './dnd'

export {
  selectPageById,
  selectPagesById,
  selectVisualComponentById,
  selectVisualComponentsById,
} from './siteSelectors'
