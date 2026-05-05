/**
 * Agent system prompt — built as a static-prefix + dynamic-suffix array so
 * the SDK can apply prompt caching to the static portion.
 *
 * Architectural philosophy (Anthropic's Agent SDK docs, building-effective-
 * agents): tools are the primary actions Claude considers. Tool descriptions
 * are where operational details belong. The system prompt is for ENVIRONMENT,
 * not BEHAVIOR — it should set up the workspace and step out of the way.
 *
 * Concretely, this prompt no longer dumps the module registry, class registry,
 * page tree, or render warnings into context. All of that is reachable via
 * the `page_builder` MCP tools (list_modules, list_classes, list_breakpoints,
 * inspect_page, inspect_node, inspect_class, render_snapshot). Claude pulls
 * only what it needs, and the cached prefix stays byte-identical across
 * conversation turns and across users.
 *
 * Constraint #283/#286: this file has no Anthropic SDK dependency. The
 * SYSTEM_PROMPT_DYNAMIC_BOUNDARY string literal matches the SDK's exported
 * constant; embedding it directly avoids importing the SDK from src/.
 */

import type { PageContext } from './types'

// Mirror of the SDK's exported SYSTEM_PROMPT_DYNAMIC_BOUNDARY constant.
// Keeping the literal here lets src/ stay free of the Anthropic SDK
// (Constraint #283 / no-anthropic-sdk gate).
export const SYSTEM_PROMPT_DYNAMIC_BOUNDARY = '__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__'

// ---------------------------------------------------------------------------
// Static prefix — identical across turns and across users; eligible for
// prompt-cache reuse.
// ---------------------------------------------------------------------------

const STATIC_PROMPT_PREFIX = `You are an AI assistant embedded in a visual page builder. You help users build and modify their websites by calling page_builder MCP tools.

You have access to:
- The page_builder MCP — read tools (list_modules, list_classes, list_breakpoints, inspect_page, search_nodes, inspect_node, inspect_class) and write tools (insertNode, insertTree, updateNodeProps, deleteNode, moveNode, renameNode, createClass, updateClassStyles, assignClass, removeClass, addPage). Visual feedback via render_snapshot.
- Skill — load skills as advisory guidance for design and code decisions.
- WebFetch / WebSearch — look up references, brand guidelines, and docs.

You do NOT have filesystem or shell access. This panel edits the live site only; for source-level work the user opens a Claude Code terminal session.

Operating loop:
1. Read the user's intent.
2. Call discovery tools (list_*, inspect_*, search_*) to learn the current state — never invent IDs or class names.
3. Call write tools to make the change.
4. If a tool returns an error, read it and try again with corrected input. The agent loop is built for self-correction.
5. Reply with 1-2 sentences after acting.

Never write raw HTML, CSS, JavaScript, or JSON in your reply text — use the tools.`

// ---------------------------------------------------------------------------
// Dynamic suffix — minimal per-request page state. Everything else is
// reachable via discovery tools so it doesn't need to be re-shipped.
// ---------------------------------------------------------------------------

function buildDynamicSuffix(ctx: PageContext): string {
  const selected = ctx.selectedNodeId ? ctx.selectedNodeId : 'none'
  return `Page: "${ctx.pageTitle}" · root: ${ctx.rootNodeId || '(empty)'} · selected: ${selected} · breakpoint: ${ctx.activeBreakpointId || '(none)'}`
}

// ---------------------------------------------------------------------------
// Public builder
// ---------------------------------------------------------------------------

/**
 * Build the system prompt for a query as the SDK's array-with-boundary form.
 *
 * The first block is the static prefix (cacheable). The boundary marker
 * separates it from the dynamic suffix (per-request page state). The SDK
 * applies cache_control to everything before the marker.
 */
export function buildSystemPrompt(ctx: PageContext): string[] {
  return [
    STATIC_PROMPT_PREFIX,
    SYSTEM_PROMPT_DYNAMIC_BOUNDARY,
    buildDynamicSuffix(ctx),
  ]
}
