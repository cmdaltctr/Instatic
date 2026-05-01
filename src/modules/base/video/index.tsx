/* eslint-disable react-refresh/only-export-components */
/**
 * base.video - responsive video embed.
 */
import React from 'react'
import { type ModuleDefinition, type ModuleComponentProps } from '../../../core/module-engine/types'
import { registry } from '../../../core/module-engine/registry'
import { safeUrl } from '../utils/escape'
import styles from './video.module.css'
import { cn } from '../../../ui/cn'

export interface VideoProps extends Record<string, unknown> {
  source: 'media' | 'youtube' | 'url'
  youtubeId: string
  videoUrl: string
  autoplay: boolean
  loop: boolean
  muted: boolean
  controls: boolean
}

const MODULE_CLASS = 'pb-video'

function youtubeEmbedUrl(id: unknown, autoplay: unknown): string {
  const safeId = encodeURIComponent(String(id ?? '').trim())
  if (!safeId) return ''
  return `https://www.youtube.com/embed/${safeId}${autoplay ? '?autoplay=1' : ''}`
}

const VideoEditor: React.FC<ModuleComponentProps<VideoProps>> = ({ props, mcClassName }) => {
  const isYoutube = props.source === 'youtube'
  const sourceUrl = isYoutube
    ? youtubeEmbedUrl(props.youtubeId, props.autoplay)
    : props.videoUrl

  return (
    <div className={cn(styles.video, mcClassName)}>
      {!sourceUrl ? (
        <div className={styles.placeholder}>
          <span className={styles.playIcon}>Play</span>
          <span>{isYoutube ? 'YouTube ID required' : 'Video URL required'}</span>
        </div>
      ) : isYoutube ? (
        <iframe
          className={styles.inner}
          src={sourceUrl}
          title="YouTube video"
          frameBorder="0"
          allow="autoplay; encrypted-media; fullscreen"
          allowFullScreen
        />
      ) : (
        <video
          className={styles.inner}
          src={sourceUrl}
          autoPlay={props.autoplay}
          loop={props.loop}
          muted={props.muted}
          controls={props.controls}
        />
      )}
    </div>
  )
}

export const VideoModule: ModuleDefinition<VideoProps> = {
  id: 'base.video',
  name: 'Video',
  description: 'Embed a CMS media video or YouTube video.',
  category: 'Media',
  version: '2.0.0',
  icon: 'Play',
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

  render: (props) => {
    const isYoutube = String(props.source) === 'youtube'

    if (isYoutube) {
      const src = youtubeEmbedUrl(props.youtubeId, props.autoplay)
      if (!src) return { html: '' }
      return {
        html: `<iframe class="${MODULE_CLASS}" src="${src}" title="YouTube video" frameborder="0" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>`,
        css: `.${MODULE_CLASS}{display:block;width:100%;max-width:100%;aspect-ratio:16 / 9;border:0;border-radius:0;background-color:#000;overflow:hidden}`,
      }
    }

    const attrs: string[] = [`class="${MODULE_CLASS}"`]
    if (props.videoUrl) attrs.push(`src="${safeUrl(String(props.videoUrl))}"`)
    if (props.autoplay) attrs.push('autoplay')
    if (props.loop) attrs.push('loop')
    if (props.muted) attrs.push('muted')
    if (props.controls) attrs.push('controls')

    return {
      html: `<video ${attrs.join(' ')}></video>`,
      css: `.${MODULE_CLASS}{display:block;width:100%;max-width:100%;aspect-ratio:16 / 9;border:0;border-radius:0;background-color:#000;overflow:hidden}`,
    }
  },
}

registry.register(VideoModule)
