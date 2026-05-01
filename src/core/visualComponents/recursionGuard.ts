/**
 * recursionGuard — Visual Component cycle detection.
 *
 * Architecture source: Contribution #619 §3
 *
 * Two pure functions:
 *
 *   getReferencedComponentIds(node)
 *     Walks a VC node tree and returns the set of all componentIds
 *     referenced by any base.visualComponentRef nodes in that tree.
 *     Uses childNodes[] for tree traversal (VC nested-tree format).
 *
 *   wouldCreateCycle(visualComponents, hostVcId, candidateChildVcId)
 *     Returns true if adding a componentRef to candidateChildVcId inside
 *     hostVcId would create a cycle or a duplicate embedding path.
 *
 *     Detects two problematic cases:
 *       1. Candidate transitively references host (would form a direct loop).
 *       2. Host already transitively references candidate (would create a
 *          diamond/duplicate path which is treated as a cycle by this system
 *          to keep the VC dependency graph a strict tree).
 *
 * Both functions are statically testable (no store access, no site needed).
 *
 * Constraint #269: This file must NOT import from editor/ or editor-store/.
 */

// ---------------------------------------------------------------------------
// getReferencedComponentIds
// ---------------------------------------------------------------------------

/**
 * Walk a VC node tree and collect all componentIds referenced by
 * base.visualComponentRef nodes anywhere in the tree.
 *
 * Accepts `unknown` so it can safely receive raw data from test fixtures
 * and validateSite without requiring a fully-typed PageNode.
 *
 * Tree traversal uses `childNodes: unknown[]` (VC-tree nested format).
 *
 * @param node - Root node of the tree to walk (or any subtree node).
 * @returns Set of componentId strings found in the tree.
 */
export function getReferencedComponentIds(node: unknown): Set<string> {
  const result = new Set<string>()

  function walk(n: unknown): void {
    if (!n || typeof n !== 'object' || Array.isArray(n)) return
    const obj = n as Record<string, unknown>

    // If this is a visualComponentRef node, collect its componentId
    if (
      obj.moduleId === 'base.visualComponentRef' &&
      obj.props &&
      typeof obj.props === 'object' &&
      !Array.isArray(obj.props)
    ) {
      const componentId = (obj.props as Record<string, unknown>).componentId
      if (typeof componentId === 'string' && componentId.length > 0) {
        result.add(componentId)
      }
    }

    // Recurse into childNodes (VC nested-tree format)
    if (Array.isArray(obj.childNodes)) {
      for (const child of obj.childNodes) {
        walk(child)
      }
    }
  }

  walk(node)
  return result
}

// ---------------------------------------------------------------------------
// wouldCreateCycle
// ---------------------------------------------------------------------------

/**
 * Determine whether adding a componentRef to `candidateChildVcId` inside
 * `hostVcId` would create a cycle or duplicate embedding path.
 *
 * Algorithm:
 *  1. Self-cycle: hostVcId === candidateChildVcId → always true.
 *  2. Candidate-reaches-host: BFS from candidateChildVcId; if hostVcId is
 *     reachable → would form a direct loop after adding host→candidate.
 *  3. Host-reaches-candidate: BFS from hostVcId; if candidateChildVcId is
 *     already reachable → candidate is already embedded in host's tree.
 *
 * Cases 2 and 3 both return true to prevent both circular loops and
 * diamond-dependency paths in the VC reference graph.
 *
 * @param visualComponents - All VCs in the site.
 * @param hostVcId         - VC whose tree is being modified.
 * @param candidateChildVcId - VC about to be embedded as a componentRef.
 * @returns true if embedding would create a cycle/duplicate path.
 */
export function wouldCreateCycle(
  visualComponents: unknown[],
  hostVcId: string,
  candidateChildVcId: string,
): boolean {
  // Case 1: self-reference is always a cycle
  if (hostVcId === candidateChildVcId) return true

  // Build a lookup map for O(1) VC access
  const vcMap = new Map<string, unknown>()
  for (const vc of visualComponents) {
    if (vc && typeof vc === 'object' && !Array.isArray(vc)) {
      const id = (vc as Record<string, unknown>).id
      if (typeof id === 'string') {
        vcMap.set(id, vc)
      }
    }
  }

  /**
   * Collect all VC IDs transitively reachable from vcId by following
   * componentRef edges through each VC's rootNode tree.
   * Uses iterative BFS to avoid stack overflow on deep graphs.
   */
  function transitivelyReachable(startVcId: string): Set<string> {
    const visited = new Set<string>()
    const queue: string[] = [startVcId]

    while (queue.length > 0) {
      const current = queue.shift()!
      if (visited.has(current)) continue
      visited.add(current)

      const vc = vcMap.get(current)
      if (!vc) continue

      const rootNode = (vc as Record<string, unknown>).rootNode
      const directRefs = getReferencedComponentIds(rootNode)

      for (const refId of directRefs) {
        if (!visited.has(refId)) {
          queue.push(refId)
        }
      }
    }

    // Remove startVcId itself — we want reachable FROM it, not including it
    visited.delete(startVcId)
    return visited
  }

  // Case 2: candidate (transitively) already references host
  //         → adding host→candidate would form a loop
  const reachableFromCandidate = transitivelyReachable(candidateChildVcId)
  if (reachableFromCandidate.has(hostVcId)) return true

  // Case 3: host already (transitively) references candidate
  //         → candidate is already embedded in host's dependency tree
  const reachableFromHost = transitivelyReachable(hostVcId)
  if (reachableFromHost.has(candidateChildVcId)) return true

  return false
}
