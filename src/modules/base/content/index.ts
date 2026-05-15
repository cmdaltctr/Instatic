/**
 * base.content — renders the current CMS entry body.
 *
 * Emits a bare `<article>` wrapper around the entry's HTML, with no default
 * class or default CSS. Visual styling is opt-in via user classes
 * (mcClassName / multi-class system).
 */
import type { ModuleDefinition } from '@core/module-engine/types'
import { registry } from '@core/module-engine/registry'
import { ArticleSolidIcon } from 'pixel-art-icons/icons/article-solid'
import { ContentEditor } from './ContentEditor'

interface ContentProps extends Record<string, unknown> {
  html: string
}

export const ContentModule: ModuleDefinition<ContentProps> = {
  id: 'base.content',
  name: 'Content Body',
  description: 'Renders the current CMS entry body.',
  category: 'CMS',
  version: '1.0.0',
  icon: ArticleSolidIcon,
  trusted: true,
  canHaveChildren: false,

  schema: {
    html: { type: 'richtext', label: 'HTML' },
  },

  defaults: {
    html: '',
  },

  component: ContentEditor,

  htmlTag: 'article',

  render: (props) => {
    const html = typeof props.html === 'string' ? props.html : ''
    if (!html) return { html: '' }
    return {
      html: `<article>${html}</article>`,
    }
  },
}

registry.registerOrReplace(ContentModule)
