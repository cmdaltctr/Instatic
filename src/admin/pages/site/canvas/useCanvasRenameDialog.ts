/**
 * useCanvasRenameDialog — state machine for the canvas rename modal.
 *
 * Holds the dialog state (nodeId / currentName / value / error), exposes
 * open/close/commit/replace callbacks, and only dispatches `renameNode` when
 * the user actually changed the name. Lives outside `CanvasRoot` so the
 * rename UX can evolve without touching the canvas component.
 */

import { useCallback, useState } from 'react'
import { useEditorStore, selectActiveCanvasPage } from '@site/store/store'
import { registry } from '@core/module-engine/registry'
import { getNodeDisplayName } from '@core/page-tree/nodeDisplayName'

export interface CanvasRenameDialogState {
  nodeId: string
  currentName: string
  value: string
  error: string | null
}

export interface CanvasRenameDialogApi {
  state: CanvasRenameDialogState | null
  open: (nodeId: string) => void
  close: () => void
  commit: () => void
  replace: (next: CanvasRenameDialogState) => void
}

export function useCanvasRenameDialog(
  renameNode: (nodeId: string, name: string) => void,
): CanvasRenameDialogApi {
  const [state, setState] = useState<CanvasRenameDialogState | null>(null)

  const open = useCallback((nodeId: string) => {
    const storeState = useEditorStore.getState()
    const node = selectActiveCanvasPage(storeState)?.nodes[nodeId]
    if (!node) return

    const definition = registry.get(node.moduleId)
    const currentName = getNodeDisplayName(node, definition, storeState.site?.visualComponents)
    setState({ nodeId, currentName, value: currentName, error: null })
  }, [])

  const close = useCallback(() => {
    setState(null)
  }, [])

  const commit = useCallback(() => {
    setState((current) => {
      if (!current) return current
      const nextName = current.value.trim()
      if (!nextName) {
        return { ...current, error: 'Name is required' }
      }
      if (nextName !== current.currentName) {
        renameNode(current.nodeId, nextName)
      }
      return null
    })
  }, [renameNode])

  const replace = useCallback((next: CanvasRenameDialogState) => {
    setState(next)
  }, [])

  return { state, open, close, commit, replace }
}
