/**
 * base.video - responsive video embed.
 *
 * Emits a bare `<video>` or `<iframe>` with no default class or default CSS.
 * Visual styling (sizing, aspect ratio, etc.) is opt-in via user classes
 * (mcClassName / multi-class system). The editor preview wraps the element
 * in chrome that is editor-only and does NOT ship to the published page.
 */
import type { ModuleDefinition } from '@core/module-engine/types'
import { registry } from '@core/module-engine/registry'
import { VideoSolidIcon } from 'pixel-art-icons/icons/video-solid'
import { safeUrl } from '@modules/base/utils/escape'
import { VideoEditor } from './VideoEditor'

interface VideoProps extends Record<string, unknown> {
  source: 'media' | 'youtube' | 'url'
  youtubeId: string
  videoUrl: string
  autoplay: boolean
  loop: boolean
  muted: boolean
  controls: boolean
}

function youtubeEmbedUrl(id: unknown, autoplay: unknown): string {
  const safeId = encodeURIComponent(String(id ?? '').trim())
  if (!safeId) return ''
  return `https://www.youtube.com/embed/${safeId}${autoplay ? '?autoplay=1' : ''}`
}

export const VideoModule: ModuleDefinition<VideoProps> = {
  id: 'base.video',
  name: 'Video',
  description: 'Embed a CMS media video or YouTube video.',
  category: 'Media',
  version: '2.0.0',
  icon: VideoSolidIcon,
  trusted: true,
  canHaveChildren: false,

  schema: {
    source: {
      type: 'select',
      label: 'Video source',
      options: [
        { label: 'Media library', value: 'media' },
        { label: 'YouTube', value: 'youtube' },
      ],
    },
    youtubeId: {
      type: 'text',
      label: 'YouTube video ID',
      placeholder: 'dQw4w9WgXcQ',
      condition: { field: 'source', eq: 'youtube' },
    },
    videoUrl: {
      type: 'media',
      mediaKind: 'video',
      label: 'Video',
      condition: { field: 'source', eq: 'media' },
    },
    autoplay: { type: 'toggle', label: 'Autoplay' },
    loop: { type: 'toggle', label: 'Loop' },
    muted: { type: 'toggle', label: 'Muted' },
    controls: { type: 'toggle', label: 'Show controls' },
  },

  defaults: {
    source: 'media',
    youtubeId: '',
    videoUrl: '',
    autoplay: false,
    loop: false,
    muted: false,
    controls: true,
  },

  component: VideoEditor,

  htmlTag: (props) => (String(props.source) === 'youtube' ? 'iframe' : 'video'),

  render: (props) => {
    const isYoutube = String(props.source) === 'youtube'

    if (isYoutube) {
      const src = youtubeEmbedUrl(props.youtubeId, props.autoplay)
      if (!src) return { html: '' }
      return {
        html: `<iframe src="${src}" title="YouTube video" frameborder="0" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>`,
      }
    }

    const attrs: string[] = []
    if (props.videoUrl) attrs.push(`src="${safeUrl(String(props.videoUrl))}"`)
    if (props.autoplay) attrs.push('autoplay')
    if (props.loop) attrs.push('loop')
    if (props.muted) attrs.push('muted')
    if (props.controls) attrs.push('controls')

    return {
      html: attrs.length > 0 ? `<video ${attrs.join(' ')}></video>` : `<video></video>`,
    }
  },
}

registry.registerOrReplace(VideoModule)
