/**
 * Phase D — AI Agent: shared message and action types.
 *
 * These types live in core/ (no SDK imports) so they can be imported by
 * both the browser-side AgentPanel and the executor without violating
 * Constraints #283/#286 (no Anthropic SDK in src/).
 *
 * The wire format between the server and browser is NDJSON (newline-delimited
 * JSON). Each line is a `ServerStreamEvent` value, JSON-serialised.
 */

// ---------------------------------------------------------------------------
// Agent actions — the page-builder operations Claude can request
// ---------------------------------------------------------------------------

/**
 * The full set of page-builder write actions exposed as MCP tools to Claude.
 *
 * Each action is its own `mcp__page_builder__<name>` tool on the server-side
 * MCP. The server's tool handler emits a `toolRequest` stream event so the
 * browser bridge can apply the mutation against the Zustand editor store and
 * POST a result back to /api/agent/tool-result.
 */
export type AgentActionType =
  | 'insertNode'
  | 'insertTree'
  | 'deleteNode'
  | 'updateNodeProps'
  | 'moveNode'
  | 'renameNode'
  | 'createClass'
  | 'updateClassStyles'
  | 'assignClass'
  | 'removeClass'
  | 'addPage'

interface InsertNodeAction {
  type: 'insertNode'
  moduleId: string
  /** Existing parent node ID. */
  parentId: string
  /** 0-based insertion index among parent's children. Appends if omitted. */
  index?: number
  /** Initial prop values for the new node. */
  props?: Record<string, unknown>
  /** Optional CSS class IDs (or existing class names) to attach to the new node. */
  classIds?: string[]
}

interface AgentTreeClassDefinition {
  name: string
  styles?: Record<string, string | number>
  /** Per-breakpoint class styles keyed by configured Breakpoint.id. */
  breakpointStyles?: Record<string, Record<string, string | number>>
}

export interface InsertTreeNode {
  moduleId: string
  /** Initial prop values for the new node. */
  props?: Record<string, unknown>
  /**
   * CSS classes to attach. Must be existing class IDs, existing class names,
   * or names declared in insertTree.classes (those are created first).
   */
  classIds?: string[]
  children?: InsertTreeNode[]
}

interface InsertTreeAction {
  type: 'insertTree'
  /** Existing parent node ID. */
  parentId: string
  /** 0-based insertion index among parent's children. Appends if omitted. */
  index?: number
  /** CSS classes to create/update before inserting the tree. */
  classes?: AgentTreeClassDefinition[]
  /** Root node of the tree to insert. */
  tree: InsertTreeNode
}

interface DeleteNodeAction {
  type: 'deleteNode'
  nodeId: string
}

interface UpdateNodePropsAction {
  type: 'updateNodeProps'
  nodeId: string
  /** Optional configured breakpoint ID. When set, writes a breakpoint prop override. */
  breakpointId?: string
  patch: Record<string, unknown>
}

interface MoveNodeAction {
  type: 'moveNode'
  nodeId: string
  newParentId: string
  /** 0-based position in newParent's children. */
  newIndex: number
}

interface RenameNodeAction {
  type: 'renameNode'
  nodeId: string
  label: string
}

interface CreateClassAction {
  type: 'createClass'
  name: string
  styles?: Record<string, string | number>
  /** Per-breakpoint class styles keyed by configured Breakpoint.id. */
  breakpointStyles?: Record<string, Record<string, string | number>>
}

interface UpdateClassStylesAction {
  type: 'updateClassStyles'
  /** Class ID or existing class name. */
  classId: string
  /** Optional configured breakpoint ID. When set, writes class breakpoint styles. */
  breakpointId?: string
  patch: Record<string, string | number>
}

interface AssignClassAction {
  type: 'assignClass'
  nodeId: string
  /** Class ID or existing class name. */
  classId: string
}

interface RemoveClassAction {
  type: 'removeClass'
  nodeId: string
  /** Class ID or existing class name. */
  classId: string
}

interface AddPageAction {
  type: 'addPage'
  title: string
  slug?: string
}

export type AgentAction =
  | InsertNodeAction
  | InsertTreeAction
  | DeleteNodeAction
  | UpdateNodePropsAction
  | MoveNodeAction
  | RenameNodeAction
  | CreateClassAction
  | UpdateClassStylesAction
  | AssignClassAction
  | RemoveClassAction
  | AddPageAction

// ---------------------------------------------------------------------------
// Execution result
// ---------------------------------------------------------------------------
//
// Single result type used by every browser-bridged tool. The shape is flat
// with optional fields so the bridge protocol stays uniform — tools that
// don't need a particular field simply omit it.

export interface AgentActionResult {
  success: boolean
  /** Set by insertNode / insertTree / createClass — the new node/class ID. */
  nodeId?: string
  /** Failure detail; Claude reads it from the tool_result block to retry. */
  error?: string
  /** Set by render_snapshot only — captured browser screenshot + layout. */
  snapshot?: AgentRenderSnapshotPayload
}

export interface AgentRenderSnapshotPayload {
  breakpointId: string
  label: string
  width: number
  capturedAt: number
  screenshot: AgentScreenshotContext
  layout: AgentLayoutReportContext
}

// ---------------------------------------------------------------------------
// Server → Browser stream events (NDJSON wire format)
// ---------------------------------------------------------------------------

/** A chunk of text from the assistant's message. */
interface TextEvent {
  type: 'text'
  text: string
}

/**
 * Bridge handshake: the server has accepted the request and assigned a bridge
 * id. The browser uses this id when POSTing tool-result responses to
 * /api/agent/tool-result so the server can correlate the response with the
 * pending MCP tool call.
 */
interface BridgeReadyEvent {
  type: 'bridgeReady'
  bridgeId: string
}

/**
 * The server-side MCP write tool needs the browser to apply a mutation
 * against the live editor store. The browser executes it, then POSTs the
 * result to /api/agent/tool-result with `{ bridgeId, requestId, result }`.
 *
 * `name` is the tool name without the `mcp__page_builder__` prefix
 * (e.g. `insertNode`, `insertTree`, `createClass`). `input` is the tool's
 * input object as Claude produced it.
 */
interface ToolRequestEvent {
  type: 'toolRequest'
  requestId: string
  name: string
  input: unknown
}

/** Stream finished normally. */
interface DoneEvent {
  type: 'done'
}

/** Stream terminated due to a server-side error. */
interface ErrorEvent {
  type: 'error'
  message: string
}

/** Status update for SDK/MCP tools used by Claude before page-builder actions. */
interface ToolStatusEvent {
  type: 'toolStatus'
  toolCallId: string
  name: string
  status: 'pending' | 'success' | 'error'
  input?: unknown
  error?: string
}

/** Current Claude Agent SDK session ID for follow-up resume calls. */
interface SessionEvent {
  type: 'session'
  sessionId: string
}

export type ServerStreamEvent =
  | TextEvent
  | BridgeReadyEvent
  | ToolRequestEvent
  | ToolStatusEvent
  | SessionEvent
  | DoneEvent
  | ErrorEvent

// ---------------------------------------------------------------------------
// Browser conversation model
// ---------------------------------------------------------------------------

export interface AgentToolCall {
  id: string
  /** SDK tool_use id (`toolu_…`) — correlates UI badges with stream events. */
  externalId?: string
  /** Tool name as Claude saw it (e.g. `mcp__page_builder__insertNode`). */
  actionType: string
  /** Tool input as Claude produced it. */
  params: Record<string, unknown>
  result: AgentActionResult | null
  status: 'pending' | 'success' | 'error'
}

export interface AgentMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCalls: AgentToolCall[]
  timestamp: number
}

// ---------------------------------------------------------------------------
// Browser → Server request body
// ---------------------------------------------------------------------------

export interface AgentRequestBody {
  /** The user's new message. */
  prompt: string
  /** Claude Agent SDK session ID to resume for follow-up turns. */
  sessionId?: string
  /**
   * Snapshot of the current page tree injected into the system prompt.
   * Lets the server give Claude accurate context without a separate read call.
   */
  pageContext: PageContext
}

interface AgentModulePropOptionContext {
  label: string
  value: unknown
}

export interface AgentModulePropContext {
  key: string
  type: string
  label: string
  description?: string
  defaultValue?: unknown
  options?: AgentModulePropOptionContext[]
}

export interface AgentModuleStyleContext {
  key: string
  type: string
  label: string
  description?: string
  defaultValue?: unknown
  cssProperties: string[]
  options?: AgentModulePropOptionContext[]
}

export interface AgentModuleContext {
  id: string
  name: string
  description?: string
  category: string
  canHaveChildren: boolean
  defaults: Record<string, unknown>
  props: AgentModulePropContext[]
  styles: AgentModuleStyleContext[]
}

export interface AgentBreakpointContext {
  id: string
  label: string
  width: number
  icon: string
}

export interface AgentLayoutRect {
  x: number
  y: number
  width: number
  height: number
}

export interface AgentLayoutNodeContext {
  nodeId: string
  moduleId?: string
  label?: string
  text: string
  rect: AgentLayoutRect
  visible: boolean
  computed: {
    display: string
    position: string
    overflow: string
    color: string
    backgroundColor: string
    fontSize: string
    lineHeight: string
  }
}

export interface AgentLayoutImageContext {
  nodeId?: string
  src: string
  alt?: string
  complete: boolean
  naturalWidth: number
  naturalHeight: number
  rect: AgentLayoutRect
}

export interface AgentLayoutWarningContext {
  type: 'horizontal-overflow' | 'vertical-overflow' | 'hidden-overflow' | 'broken-image' | 'invisible-node'
  severity: 'info' | 'warning' | 'error'
  message: string
  nodeId?: string
}

export interface AgentLayoutReportContext {
  breakpointId: string
  viewport: {
    width: number
    height: number
    scrollWidth: number
    scrollHeight: number
  }
  nodes: AgentLayoutNodeContext[]
  images: AgentLayoutImageContext[]
  warnings: AgentLayoutWarningContext[]
}

export interface AgentScreenshotContext {
  status: 'ok' | 'unavailable' | 'error'
  mimeType?: string
  data?: string
  width?: number
  height?: number
  error?: string
}

export interface AgentRenderSnapshotContext {
  breakpointId: string
  label: string
  width: number
  capturedAt: number
  screenshot: AgentScreenshotContext
  layout: AgentLayoutReportContext
}

export interface PageContext {
  /** Active page title */
  pageTitle: string
  /** Root node ID of the active page */
  rootNodeId: string
  /** Configured breakpoint ID currently active in the editor. */
  activeBreakpointId: string
  /** Live breakpoint configuration for the site. */
  breakpoints: AgentBreakpointContext[]
  /** All nodes on the active page (flat map, serialisable subset) */
  nodes: Array<{
    id: string
    moduleId: string
    label?: string
    parentId: string | null
    children: string[]
    props: Record<string, unknown>
    breakpointOverrides: Record<string, Partial<Record<string, unknown>>>
    classIds: string[]
  }>
  /** Live module registry snapshot so Claude knows what can be inserted. */
  availableModules: AgentModuleContext[]
  /** Currently selected node ID, if any */
  selectedNodeId: string | null
  /**
   * CSS class registry — all classes defined in the site.
   * Use the `id` in assignClass/updateClassStyles for existing classes.
   * The executor also resolves classId by name as a fallback.
   */
  classes: Array<{
    id: string
    name: string
    styles?: Record<string, unknown>
    breakpointStyles?: Record<string, Record<string, unknown>>
  }>
}
