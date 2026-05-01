import { useCallback, type SyntheticEvent } from 'react'
import { registry } from '@core/module-engine/registry'
import { useInsertModule } from '../../hooks/useInsertModule'
import { ModulePickerDropdown } from '../Toolbar/ModulePickerDropdown'
import { CheckboxSharpIcon } from '@ui/icons/icons/checkbox-sharp'
import { TypeIcon } from '@ui/icons/icons/type'
import { ImageIcon } from '@ui/icons/icons/image'
import { BoxIcon } from '@ui/icons/icons/box'
import { Button } from '@ui/components/Button'
import styles from './CanvasNotch.module.css'

const QUICK_ACTIONS = [
  { moduleId: 'base.container', label: 'Container', icon: CheckboxSharpIcon },
  { moduleId: 'base.text', label: 'Text', icon: TypeIcon },
  { moduleId: 'base.image', label: 'Image', icon: ImageIcon },
  { moduleId: 'base.button', label: 'Button', icon: BoxIcon },
] as const

const ADD_TRIGGER_TEST_ID = 'canvas-notch-add-btn'

export function CanvasNotch() {
  const insertModule = useInsertModule()

  const stopCanvasInteraction = useCallback((event: SyntheticEvent) => {
    event.stopPropagation()
  }, [])

  const handleQuickInsert = useCallback(
    (moduleId: (typeof QUICK_ACTIONS)[number]['moduleId']) => {
      const mod = registry.get(moduleId)
      if (!mod) return
      insertModule(mod)
    },
    [insertModule],
  )

  return (
    <div
      className={styles.shell}
      aria-label="Insert modules"
      data-testid="canvas-notch"
      onClick={stopCanvasInteraction}
    >
      <div className={styles.notch}>
        {QUICK_ACTIONS.map((action) => {
          const ActionIcon = action.icon
          return (
            <Button
              key={action.moduleId}
              variant="ghost"
              size="sm"
              iconOnly
              className={styles.quickButton}
              onClick={() => handleQuickInsert(action.moduleId)}
              aria-label={`Add ${action.label}`}
              title={`Add ${action.label}`}
              data-testid={`canvas-notch-${action.label.toLowerCase()}-btn`}
            >
              <ActionIcon size={14} aria-hidden="true" />
            </Button>
          )
        })}

        <span className={styles.divider} aria-hidden="true" />

        <ModulePickerDropdown
          triggerClassName={styles.addButton}
          triggerTestId={ADD_TRIGGER_TEST_ID}
        />
      </div>
    </div>
  )
}
