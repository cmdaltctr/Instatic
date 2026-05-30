import { type CSSProperties, type Ref } from 'react'
import { cn } from '@ui/cn'
import styles from './ProgressBar.module.css'

export interface ProgressBarProps {
  /** Current value. Will be clamped to [0, max]. */
  value: number
  /** Max value. Defaults to 100. */
  max?: number
  /** Optional accessible label. Falls back to 'Progress' for aria-label. */
  label?: string
  /** Bar height. sm = 3px, md = 6px. Defaults to 'sm'. */
  size?: 'sm' | 'md'
  /** Fill color variant. */
  tone?: 'default' | 'success' | 'warning' | 'danger'
  /** When true, renders an indeterminate striped/shimmer animation. value is ignored. */
  indeterminate?: boolean
  className?: string
  /** React 19: ref is a regular prop on function components. */
  ref?: Ref<HTMLDivElement>
}

export function ProgressBar({
  value,
  max = 100,
  label,
  size = 'sm',
  tone = 'default',
  indeterminate = false,
  className,
  ref,
}: ProgressBarProps) {
  const clamped = indeterminate ? 0 : Math.min(max, Math.max(0, value))
  const pct = indeterminate ? 0 : (max === 0 ? 0 : Math.round((clamped / max) * 100))

  return (
    <div
      ref={ref}
      role="progressbar"
      aria-label={label ?? 'Progress'}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={indeterminate ? undefined : clamped}
      aria-valuetext={indeterminate ? undefined : `${pct}%`}
      data-size={size}
      data-tone={tone !== 'default' ? tone : undefined}
      data-indeterminate={indeterminate ? 'true' : undefined}
      className={cn(styles.rail, className)}
    >
      <div
        className={styles.fill}
        style={indeterminate ? undefined : ({ '--pb-fill': `${pct}%` } as CSSProperties)}
      />
    </div>
  )
}
