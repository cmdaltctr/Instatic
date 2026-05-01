/* eslint-disable react-refresh/only-export-components */
/**
 * base.image — image content.
 */
import React from 'react'
import { type ModuleDefinition, type ModuleComponentProps } from '../../../core/module-engine/types'
import { registry } from '../../../core/module-engine/registry'
import { safeUrl } from '../utils/escape'
import styles from './image.module.css'
import { cn } from '../../../ui/cn'

export interface ImageProps extends Record<string, unknown> {
  src: string
  alt: string
  loading: 'lazy' | 'eager'
}

const MODULE_CLASS = 'pb-image'

const ImageEditor: React.FC<ModuleComponentProps<ImageProps>> = ({ props, mcClassName }) => {
  if (props.src) {
    return <img src={props.src} alt={props.alt || ''} className={cn(styles.image, mcClassName)} loading={props.loading} />
  }
  return <div className={cn(styles.placeholder, mcClassName)}>No image selected</div>
}

export const ImageModule: ModuleDefinition<ImageProps> = {
  id: 'base.image',
  name: 'Image',
  description: 'A responsive image.',
  category: 'Media',
  version: '2.0.0',
  icon: 'Image',
  trusted: true,
  canHaveChildren: false,

  schema: {
    src: { type: 'image', label: 'Image' },
    alt: { type: 'text', label: 'Alt text', placeholder: 'Describe the image...' },
    loading: {
      type: 'select',
      label: 'Loading',
      options: [
        { label: 'Lazy', value: 'lazy' },
        { label: 'Eager', value: 'eager' },
      ],
    },
  },

  defaults: {
    src: '',
    alt: '',
    loading: 'lazy',
  },

  component: ImageEditor,

  render: (props) => {
    const src = safeUrl(props.src)
    const alt = String(props.alt ?? '')
    const loading = props.loading === 'eager' ? 'eager' : 'lazy'
    if (!src) return { html: '' }
    return {
      html: `<img class="${MODULE_CLASS}" src="${src}" alt="${alt}" loading="${loading}">`,
      css: `.${MODULE_CLASS}{display:block;width:100%;height:auto;max-width:100%;border-radius:0}`,
    }
  },
}

registry.register(ImageModule)
