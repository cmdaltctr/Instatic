/* eslint-disable react-refresh/only-export-components */
/**
 * base.button — content/behavior module.
 */
import React from 'react'
import { type ModuleDefinition, type ModuleComponentProps } from '../../../core/module-engine/types'
import { registry } from '../../../core/module-engine/registry'
import { safeUrl } from '../utils/escape'
import styles from './button.module.css'
import { cn } from '../../../ui/cn'

export interface ButtonProps extends Record<string, unknown> {
  label: string
  href: string
  target: '_blank' | '_self' | '_parent'
  disabled: boolean
}

const MODULE_CLASS = 'pb-button'

const ButtonEditor: React.FC<ModuleComponentProps<ButtonProps>> = ({ props, mcClassName }) => {
  if (props.href) {
    const rel = props.target === '_blank' ? 'noopener noreferrer' : undefined
    return <a href={props.href} target={props.target} rel={rel} className={cn(styles.button, mcClassName)}>{props.label || 'Button'}</a>
  }
  return <button type="button" className={cn(styles.button, mcClassName)} disabled={props.disabled}>{props.label || 'Button'}</button>
}

export const ButtonModule: ModuleDefinition<ButtonProps> = {
  id: 'base.button',
  name: 'Button',
  description: 'A button or call-to-action link.',
  category: 'Interactive',
  version: '2.0.0',
  icon: 'MousePointerClick',
  trusted: true,
  canHaveChildren: false,

  schema: {
    label: { type: 'text', label: 'Label', placeholder: 'Button text...' },
    href: { type: 'url', label: 'Link URL' },
    target: {
      type: 'select',
      label: 'Link target',
      condition: { field: 'href', notEq: '' },
      options: [
        { label: 'Same tab', value: '_self' },
        { label: 'New tab', value: '_blank' },
        { label: 'Parent', value: '_parent' },
      ],
    },
    disabled: { type: 'toggle', label: 'Disabled' },
  },

  defaults: {
    label: 'Get Started',
    href: '',
    target: '_self',
    disabled: false,
  },

  component: ButtonEditor,

  render: (props) => {
    const href = safeUrl(props.href)
    const label = String(props.label ?? '')
    const rel = props.target === '_blank' ? ' rel="noopener noreferrer"' : ''
    if (href && href !== '#') {
      return { html: `<a class="${MODULE_CLASS}" href="${href}" target="${String(props.target)}"${rel}>${label}</a>`, css: buttonCss() }
    }
    const disabledAttr = props.disabled ? ' disabled aria-disabled="true"' : ''
    return { html: `<button class="${MODULE_CLASS}" type="button"${disabledAttr}>${label}</button>`, css: buttonCss() }
  },
}

function buttonCss(): string {
  return `.${MODULE_CLASS}{display:inline-block;width:auto;text-align:center;padding:10px 20px;font-size:15px;font-weight:600;border-radius:8px;cursor:pointer;text-decoration:none;transition:opacity .15s;opacity:1;border:2px solid transparent;box-sizing:border-box;background-color:#6366f1;color:#fff}.${MODULE_CLASS}:disabled{cursor:not-allowed;opacity:.5}`
}

registry.register(ButtonModule)
