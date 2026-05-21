/**
 * base.link editor preview component.
 *
 * Component-only file so React Fast Refresh can hot-patch edits without
 * re-running module registration.
 *
 * Children-vs-text fallback MUST mirror the publisher (`render()` in
 * `index.ts`). The publisher emits `props.text` whenever the node has no
 * rendered children. `??` alone is wrong here because `NodeRenderer` always
 * passes `node.children.map(...)` — an empty array is NOT nullish, so a
 * `children ?? props.text` short-circuit would render an empty link in the
 * canvas while the published page renders the text.
 */
import React from 'react'
import type { ModuleComponentProps } from '@core/module-engine/types'

interface LinkProps extends Record<string, unknown> {
  href: string
  text: string
  target: '_blank' | '_self' | '_parent'
}

export const LinkEditor: React.FC<ModuleComponentProps<LinkProps>> = ({ props, children, mcClassName }) => {
  const rel = props.target === '_blank' ? 'noopener noreferrer' : undefined
  const hasChildren = Array.isArray(children) ? children.length > 0 : children != null
  const content = hasChildren ? children : (props.text ?? 'Link text')
  return React.createElement(
    'a',
    {
      href: props.href || '#',
      target: props.target,
      rel,
      className: mcClassName,
    },
    content,
  )
}
