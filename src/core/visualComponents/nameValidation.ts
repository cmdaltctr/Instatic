/**
 * nameValidation — Visual Component name safety checks.
 *
 * Architecture source: Contribution #619 §6
 *
 * Rules enforced by validateComponentName():
 *  1. Name must not be empty.
 *  2. Must match PascalCase: /^[A-Z][A-Za-z0-9]*$/
 *  3. Must not be a reserved React/JS name (Fragment, Suspense, etc.)
 *  4. Must not collide with a base module display name (Button, Text, etc.)
 *  5. Must be unique within the site (by name, selfId skips own entry on rename)
 *
 * Pattern mirrors isSafePath() in core/files/pathValidation.ts.
 *
 * Constraint #269: This file must NOT import from editor/ or editor-store/.
 */

// ---------------------------------------------------------------------------
// NameError codes — one per failure reason (test gate NV-1 to NV-9)
// ---------------------------------------------------------------------------

export type NameError =
  | 'EMPTY'
  | 'NOT_PASCAL_CASE'
  | 'RESERVED_WORD'
  | 'BASE_MODULE_COLLISION'
  | 'PROJECT_DUPLICATE'

// ---------------------------------------------------------------------------
// ParamError codes — for validateParamName() (test gate PV-1 to PV-4)
// ---------------------------------------------------------------------------

export type ParamError =
  | 'EMPTY'
  | 'NOT_CAMEL_CASE'
  | 'RESERVED_JS_KEYWORD'
  | 'DUPLICATE'

// ---------------------------------------------------------------------------
// Reserved React / JS names that are PascalCase
// ---------------------------------------------------------------------------

/**
 * React built-ins and JS global constructors that would conflict if used
 * as user-authored component names.
 */
export const RESERVED_REACT_NAMES: ReadonlySet<string> = new Set([
  // React built-ins
  'Fragment',
  'Suspense',
  'StrictMode',
  'Profiler',
  'Children',
  'Component',
  'PureComponent',
  'Context',
  'Provider',
  'Consumer',
  'ForwardRef',
  'Memo',
  'Lazy',
  'Portal',
  'ErrorBoundary',
  // JS global constructors that are PascalCase
  'Object',
  'Array',
  'Function',
  'String',
  'Number',
  'Boolean',
  'Symbol',
  'BigInt',
  'Date',
  'RegExp',
  'Error',
  'Promise',
  'Map',
  'Set',
  'WeakMap',
  'WeakSet',
  'WeakRef',
  'Proxy',
  'Reflect',
  'JSON',
  'Math',
  'NaN',
  'Infinity',
  'Int8Array',
  'Uint8Array',
  'Int16Array',
  'Uint16Array',
  'Int32Array',
  'Uint32Array',
  'Float32Array',
  'Float64Array',
  'BigInt64Array',
  'BigUint64Array',
  'ArrayBuffer',
  'DataView',
  'SharedArrayBuffer',
  'Atomics',
  'Generator',
  'GeneratorFunction',
  'AsyncFunction',
  'AsyncGenerator',
  'AsyncGeneratorFunction',
  'Iterator',
  'Iterable',
])

// ---------------------------------------------------------------------------
// Base module display names (Context #338 — 10 canonical base modules)
// ---------------------------------------------------------------------------

/**
 * Lowercased set of all base module display names.
 * Prevents users from naming a VC "Button" when base.button already exists,
 * which would cause naming conflicts in the publisher's import graph.
 *
 * Source: Context #338 canonical base module list (from base/index.ts registry).
 */
export const BASE_MODULE_DISPLAY_NAMES_LOWER: ReadonlySet<string> = new Set([
  'root',
  'container',
  'spacer',
  'divider',
  'text',
  'list',
  'image',
  'button',
  'link',
  'video',
  'columns',
])

// ---------------------------------------------------------------------------
// Reserved JavaScript keywords (ES2023 + strict-mode future-reserved)
// ---------------------------------------------------------------------------

/**
 * Full set of reserved words that cannot appear as destructuring binding
 * identifiers in TypeScript/JavaScript. Any param name in this set would
 * produce a SyntaxError in the generated component function signature.
 *
 * Source: ECMAScript 2023 §12.7 (reserved words) + strict-mode future-reserved.
 */
export const RESERVED_JS_KEYWORDS: ReadonlySet<string> = new Set([
  // ES reserved words
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
  'default', 'delete', 'do', 'else', 'export', 'extends', 'false',
  'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof',
  'let', 'new', 'null', 'return', 'static', 'super', 'switch', 'this',
  'throw', 'true', 'try', 'typeof', 'var', 'void', 'while', 'with',
  'yield', 'enum', 'await',
  // Strict-mode future-reserved words
  'implements', 'interface', 'package', 'private', 'protected', 'public',
])

// ---------------------------------------------------------------------------
// validateComponentName
// ---------------------------------------------------------------------------

/**
 * Validate a proposed Visual Component name.
 *
 * @param name       - The proposed name string.
 * @param existing   - All existing VCs in the site (for uniqueness check).
 * @param selfId     - When renaming, pass the VC's own id to skip it in the
 *                     duplicate check (prevents false PROJECT_DUPLICATE on
 *                     renaming a VC to its current name).
 *
 * @returns `{ok: true}` on success, or `{ok: false, error, reason}` on failure.
 */
export function validateComponentName(
  name: string,
  existing: Array<{ id: string; name: string }>,
  selfId?: string,
): { ok: true } | { ok: false; error: NameError; reason: string } {
  // Rule 1 — must not be empty
  if (!name || name.trim().length === 0) {
    return {
      ok: false,
      error: 'EMPTY',
      reason: 'Component name is required.',
    }
  }

  // Rule 2 — must be PascalCase (starts with uppercase, alphanumeric only)
  if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) {
    return {
      ok: false,
      error: 'NOT_PASCAL_CASE',
      reason: 'Use PascalCase (e.g. Card, MyButton). Must start with an uppercase letter.',
    }
  }

  // Rule 3 — must not be a reserved React/JS name
  if (RESERVED_REACT_NAMES.has(name)) {
    return {
      ok: false,
      error: 'RESERVED_WORD',
      reason: `"${name}" is a reserved React/JS name and cannot be used as a component name.`,
    }
  }

  // Rule 4 — must not collide with a base module display name
  if (BASE_MODULE_DISPLAY_NAMES_LOWER.has(name.toLowerCase())) {
    return {
      ok: false,
      error: 'BASE_MODULE_COLLISION',
      reason: `"${name}" conflicts with a built-in base module. Choose a different name.`,
    }
  }

  // Rule 5 — must be unique within the site (skip own entry on rename via selfId)
  const duplicate = existing.find((vc) => vc.id !== selfId && vc.name === name)
  if (duplicate) {
    return {
      ok: false,
      error: 'PROJECT_DUPLICATE',
      reason: `Another component is already named "${name}".`,
    }
  }

  return { ok: true }
}

// ---------------------------------------------------------------------------
// validateParamName
// ---------------------------------------------------------------------------

/**
 * Validate a proposed Visual Component param name.
 *
 * Rules:
 *  1. Must not be empty.
 *  2. Must be camelCase: /^[a-z][A-Za-z0-9]*$/ — starts lowercase, alphanumeric only.
 *  3. Must not be a reserved JavaScript keyword (would produce SyntaxError in
 *     the destructured function signature emitted by vcToComponent).
 *  4. Must be unique within the VC's existing params.
 *
 * @param name          - The proposed param name string.
 * @param existingParams - All params currently on the VC (for uniqueness check).
 * @param selfId        - When renaming, pass the param's own id to skip it in
 *                        the duplicate check.
 *
 * @returns `{ok: true}` on success, or `{ok: false, error, reason}` on failure.
 */
export function validateParamName(
  name: string,
  existingParams: Array<{ id: string; name: string }>,
  selfId?: string,
): { ok: true } | { ok: false; error: ParamError; reason: string } {
  // Rule 1 — must not be empty
  if (!name || name.trim().length === 0) {
    return {
      ok: false,
      error: 'EMPTY',
      reason: 'Param name is required.',
    }
  }

  // Rule 2 — must be camelCase (starts with lowercase letter, alphanumeric only)
  if (!/^[a-z][A-Za-z0-9]*$/.test(name)) {
    return {
      ok: false,
      error: 'NOT_CAMEL_CASE',
      reason: 'Use camelCase (e.g. title, imageUrl). Must start with a lowercase letter, letters and numbers only.',
    }
  }

  // Rule 3 — must not be a reserved JS keyword
  if (RESERVED_JS_KEYWORDS.has(name)) {
    return {
      ok: false,
      error: 'RESERVED_JS_KEYWORD',
      reason: `"${name}" is a reserved JavaScript keyword and cannot be used as a param name.`,
    }
  }

  // Rule 4 — must be unique within the VC's params (skip self on rename)
  const duplicate = existingParams.find((p) => p.id !== selfId && p.name === name)
  if (duplicate) {
    return {
      ok: false,
      error: 'DUPLICATE',
      reason: `Another param is already named "${name}".`,
    }
  }

  return { ok: true }
}
