/**
 * ShortcutsSection — keyboard shortcut reference table.
 */
import s from '../Settings.module.css'

const SHORTCUTS: Array<{ category: string; items: Array<{ keys: string[]; action: string }> }> = [
  {
    category: 'Canvas',
    items: [
      { keys: ['Space', 'Drag'], action: 'Pan canvas' },
      { keys: ['Ctrl', '+'], action: 'Zoom in' },
      { keys: ['Ctrl', '-'], action: 'Zoom out' },
      { keys: ['Ctrl', '0'], action: 'Reset zoom' },
      { keys: ['Ctrl', 'Shift', '1'], action: 'Fit to screen' },
      { keys: ['Escape'], action: 'Deselect / close picker' },
    ],
  },
  {
    category: 'Selection',
    items: [
      { keys: ['Click'], action: 'Select element' },
      { keys: ['Enter'], action: 'Select element (keyboard)' },
      { keys: ['Space'], action: 'Select element (keyboard)' },
      { keys: ['Tab'], action: 'Next element in DOM order' },
      { keys: ['Shift', 'Tab'], action: 'Previous element in DOM order' },
    ],
  },
  {
    category: 'Edit',
    items: [
      { keys: ['Ctrl', 'Z'], action: 'Undo' },
      { keys: ['Ctrl', 'Shift', 'Z'], action: 'Redo' },
      { keys: ['Ctrl', 'D'], action: 'Duplicate selected element' },
      { keys: ['Delete'], action: 'Delete selected element' },
      { keys: ['Backspace'], action: 'Delete selected element' },
    ],
  },
  {
    category: 'File',
    items: [
      { keys: ['Ctrl', 'S'], action: 'Save site' },
    ],
  },
  {
    category: 'Panels',
    items: [
      { keys: ['F6'], action: 'Cycle focus: canvas → DOM panel → Properties' },
      { keys: ['Ctrl', 'E'], action: 'Expand all (DOM panel)' },
      { keys: ['Ctrl', 'W'], action: 'Collapse all (DOM panel)' },
    ],
  },
]

export function ShortcutsSection() {
  return (
    <div>
      <h3 className={s.sectionHeading}>Keyboard Shortcuts</h3>
      <p className={s.sectionDescription}>Reference for all editor keyboard shortcuts.</p>

      {SHORTCUTS.map(({ category, items }) => (
        <section key={category} className={s.shortcutCategory}>
          <h4 className={s.subHeading}>{category}</h4>
          <table className={s.shortcutTable}>
            <tbody>
              {items.map(({ keys, action }) => (
                <tr key={action} className={s.shortcutRow}>
                  <td className={s.shortcutCell}>
                    <div className={s.shortcutKeys}>
                      {keys.map((key, i) => (
                        <kbd key={i} className={s.kbd}>
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </td>
                  <td className={s.shortcutAction}>{action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  )
}
