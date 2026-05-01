/**
 * base.link — anchor element.
 */
import React from 'react'
import { type ModuleDefinition, type ModuleComponentProps } from '../../../core/module-engine/types'
import { registry } from '../../../core/module-engine/registry'
import { safeUrl } from '../utils/escape'
import styles from './link.module.css'
import { cn } from '../../../ui/cn'

export interface LinkProps extends Record<string, unknown> {
  href: string
  text: string
  target: '_blank' | '_self' | '_parent'
}

const MODULE_CLASS = 'pb-link'

const LinkEditor: React.FC<ModuleComponentProps<LinkProps>> = ({ props, children, mcClassName }) => {
  const rel = props.target === '_blank' ? 'noopener noreferrer' : undefined
  return React.createElement(
    'a',
    {
      href: props.href || '#',
      target: props.target,
      rel,
      className: cn(styles.link, mcClassName),
    },
    children ?? props.text ?? 'Link text',
  )
}

export const LinkModule: ModuleDefinition<LinkProps> = {
  id: 'base.link',
  name: 'Link',
  description: 'An anchor element.',
  category: 'Interactive',
  version: '2.0.0',
  icon: 'Link',
  trusted: true,
  canHaveChildren: true,

  schema: {
    href: { type: 'url', label: 'URL' },
    text: { type: 'text', label: 'Link text', placeholder: 'Displayed when no children' },
    target: {
      type: 'select',
      label: 'Target',
      options: [
        { label: 'Same tab', value: '_self' },
        { label: 'New tab', value: '_blank' },
        { label: 'Parent', value: '_parent' },
      ],
    },
  },

  defaults: {
    href: '#',
    text: 'Click here',
    target: '_self',
  },

  component: LinkEditor,

  render: (props, renderedChildren) => {
    const href = safeUrl(props.href)
    const rel = props.target === '_blank' ? ' rel="noopener noreferrer"' : ''
    const targetAttr = ` target="${String(props.target)}"`
    const content = renderedChildren.length > 0 ? renderedChildren.join('') : String(props.text ?? '')
    return {
      html: `<a class="${MODULE_CLASS}" href="${href}"${targetAttr}${rel}>${content}</a>`,
      css: `.${MODULE_CLASS}{color:#6366f1;text-decoration:none;display:inline;font-weight:400;font-size:16px}`,
    }
  },
}

registry.register(LinkModule)
