import { useState, type ReactNode } from 'react'
import { DomTreeContext } from './DomTreeContext'

export function DomTreeProvider({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  const isExpanded = (nodeId: string) => expanded.has(nodeId)

  const toggleExpanded = (nodeId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }

  const expandNode = (nodeId: string) => {
    setExpanded((prev) => {
      if (prev.has(nodeId)) return prev
      const next = new Set(prev)
      next.add(nodeId)
      return next
    })
  }

  const expandAll = (nodeIds: string[]) => {
    setExpanded(new Set(nodeIds))
  }

  const collapseAll = () => {
    setExpanded(new Set())
  }

  const value = { expanded, isExpanded, toggleExpanded, expandNode, expandAll, collapseAll }

  return (
    <DomTreeContext.Provider value={value}>
      {children}
    </DomTreeContext.Provider>
  )
}
