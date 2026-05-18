/**
 * base.container editor preview component.
 *
 * Component-only file so React Fast Refresh can hot-patch edits without
 * re-running module registration. Tag resolution lives in the shared
 * `@modules/base/utils/htmlTag` helper — same code path the publisher
 * uses, so canvas + published HTML match exactly.
 *
 * Empty containers render the shared `CanvasModulePlaceholder` *inside*
 * the user's resolved tag so the empty state reads the same way as every
 * other module (image, video, content, loop, slot-outlet, …) while still
 * emitting the user's semantic element (`<section>`, `<header>`, etc.) on
 * canvas. The user's `mcClassName` stays on the outer tag where they
 * authored it, and `data-canvas-empty-container` stays on the outer
 * element so the canvas selection logic keeps treating the slot as a
 * pickable affordance.
 */
import React from 'react'
import type { ModuleComponentProps } from '@core/module-engine/types'
import { resolveHtmlTag } from '@modules/base/utils/htmlTag'
import { CanvasModulePlaceholder } from '@ui/components/CanvasModulePlaceholder'
import { ContainerSolidIcon } from 'pixel-art-icons/icons/container-solid'

interface ContainerProps extends Record<string, unknown> {
  tag: string
  customTag: string
}

export const ContainerEditor: React.FC<ModuleComponentProps<ContainerProps>> = ({
  props,
  children,
  mcClassName,
}) => {
  const Tag = resolveHtmlTag(props.tag, props.customTag)
  const isEmpty = React.Children.count(children) === 0

  return React.createElement(
    Tag,
    {
      className: mcClassName,
      'data-canvas-empty-container': isEmpty ? 'true' : undefined,
    },
    isEmpty ? (
      <CanvasModulePlaceholder
        icon={<ContainerSolidIcon size={16} color="currentColor" />}
        label="Empty container"
      />
    ) : children,
  )
}
