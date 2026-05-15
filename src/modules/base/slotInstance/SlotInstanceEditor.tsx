/**
 * base.slot-instance editor preview component.
 *
 * Component-only file so React Fast Refresh can hot-patch edits without
 * re-running module registration.
 *
 * Renders a labeled drop-zone container showing the slot name in the header
 * and the user-authored slot content (children) in the body. The visual
 * treatment makes it clear this is a structural VC slot, not a plain container.
 */
import React from 'react'
import type { ModuleComponentProps } from '@core/module-engine/types'
import { TargetSolidIcon } from 'pixel-art-icons/icons/target-solid'
import styles from './SlotInstance.module.css'

interface SlotInstanceProps extends Record<string, unknown> {
  slotName: string
}

export const SlotInstanceEditor: React.FC<ModuleComponentProps<SlotInstanceProps>> = ({
  props,
  children,
}) => {
  const slotName =
    typeof props.slotName === 'string' && props.slotName ? props.slotName : 'children'

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <TargetSolidIcon size={11} color="currentColor" aria-hidden="true" />
        <span className={styles.label}>Slot: {slotName}</span>
      </div>
      <div className={styles.content}>{children}</div>
    </div>
  )
}
