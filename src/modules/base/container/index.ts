/**
 * base.container — semantic wrapper.
 *
 * Emits the chosen semantic tag with no default class or default CSS.
 * Visual styling is opt-in via user classes (mcClassName / multi-class system).
 */
import type { ModuleDefinition } from '@core/module-engine/types'
import { registry } from '@core/module-engine/registry'
import { SquareSolidIcon } from 'pixel-art-icons/icons/square-solid'
import { ContainerEditor } from './ContainerEditor'

type ContainerTag = 'div' | 'section' | 'article' | 'main' | 'header' | 'footer'

interface ContainerProps extends Record<string, unknown> {
  tag: ContainerTag
}

const VALID_TAGS = new Set<ContainerTag>(['div', 'section', 'article', 'main', 'header', 'footer'])

function resolveContainerTag(value: unknown): ContainerTag {
  return typeof value === 'string' && VALID_TAGS.has(value as ContainerTag)
    ? (value as ContainerTag)
    : 'div'
}

export const ContainerModule: ModuleDefinition<ContainerProps> = {
  id: 'base.container',
  name: 'Container',
  description: 'A semantic container.',
  category: 'Layout',
  version: '2.0.0',
  icon: SquareSolidIcon,
  trusted: true,
  canHaveChildren: true,

  schema: {
    tag: {
      type: 'select',
      label: 'HTML tag',
      options: [
        { label: 'div', value: 'div' },
        { label: 'section', value: 'section' },
        { label: 'article', value: 'article' },
        { label: 'main', value: 'main' },
        { label: 'header', value: 'header' },
        { label: 'footer', value: 'footer' },
      ],
    },
  },

  defaults: {
    tag: 'div',
  },

  component: ContainerEditor,

  htmlTag: (props) => resolveContainerTag(props.tag),

  render: (props, renderedChildren) => {
    const tag = resolveContainerTag(props.tag)
    return {
      html: `<${tag}>${renderedChildren.join('')}</${tag}>`,
    }
  },
}

registry.registerOrReplace(ContainerModule)
