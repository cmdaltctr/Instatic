/**
 * base.slot-outlet — slot placeholder inside a Visual Component tree.
 *
 * Marks the position where slot content from a parent vcRef instance will
 * be injected at render time. Visually distinct (dashed outline) so the
 * VC author knows it is a slot, not a regular container.
 *
 * The `slotName` matches the `slotName` prop on the consumer's `base.slot-instance`
 * child in the page tree. The publisher substitutes the slot-instance's children here.
 *
 * Architecture source: Contribution #619 §8
 */
import type { ModuleDefinition } from '@core/module-engine/types'
import { registry } from '@core/module-engine/registry'
import { TargetSolidIcon } from 'pixel-art-icons/icons/target-solid'
import { SlotOutletEditor } from './SlotOutletEditor'

interface SlotOutletProps extends Record<string, unknown> {
  slotName: string
}

export const SlotOutletModule: ModuleDefinition<SlotOutletProps> = {
  id: 'base.slot-outlet',
  name: 'Slot',
  description: 'A slot placeholder for component content',
  category: 'Components',
  version: '1.0.0',
  icon: TargetSolidIcon,
  trusted: true,
  canHaveChildren: false,

  schema: {
    slotName: {
      type: 'text',
      label: 'Slot name',
      placeholder: 'children',
      description: 'camelCase identifier (e.g. children, header, footer)',
    },
  },

  defaults: {
    slotName: 'children',
  },

  component: SlotOutletEditor,

  /**
   * Publisher safety-net: the walker reaches slot-outlet only when
   * instantiateVCAtRef kept the outlet as a placeholder — meaning no slot
   * content was provided AND the slot param has no defaultValue. Return empty
   * HTML so the slot contributes nothing to the published page.
   */
  render: () => ({ html: '', css: '' }),
}

registry.registerOrReplace(SlotOutletModule)
