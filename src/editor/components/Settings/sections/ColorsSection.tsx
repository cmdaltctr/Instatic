/**
 * ColorsSection — global CSS custom-property (design token) editor.
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { useEditorStore } from '../../../../core/editor-store/store'
import { Button } from '@ui/components/Button'
import { Input } from '@ui/components/Input'
import { ColorInput } from '@ui/components/ColorInput'
import s from '../Settings.module.css'

// ─── Validation ───────────────────────────────────────────────────────────────

const TOKEN_NAME_RE = /^--[a-z][a-z0-9-]*$/
const EMPTY_COLOR_TOKENS: Record<string, string> = {}

function validateName(name: string): string | null {
  if (!name.trim()) return 'Token name is required.'
  if (!TOKEN_NAME_RE.test(name.trim())) {
    return 'Name must start with "--" followed by a lowercase letter and contain only letters, digits, and hyphens (e.g. "--color-brand").'
  }
  return null
}

// ─── ColorsSection ────────────────────────────────────────────────────────────

export function ColorsSection() {
  const site = useEditorStore((state) => state.site)
  const updateSiteSettings = useEditorStore((state) => state.updateSiteSettings)

  const [newName, setNewName] = useState('--color-')
  const [newValue, setNewValue] = useState('#000000')
  const [nameError, setNameError] = useState<string | null>(null)
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null)

  const confirmBtnRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (confirmDeleteKey) confirmBtnRef.current?.focus()
  }, [confirmDeleteKey])

  const colorTokens = site?.settings.colorTokens ?? EMPTY_COLOR_TOKENS
  const entries = Object.entries(colorTokens)

  const handleUpdateValue = useCallback(
    (key: string, value: string) => {
      updateSiteSettings({ colorTokens: { ...colorTokens, [key]: value } })
    },
    [colorTokens, updateSiteSettings],
  )

  const handleDelete = useCallback(
    (key: string) => {
      const rest = { ...colorTokens }
      delete rest[key]
      updateSiteSettings({ colorTokens: rest })
      setConfirmDeleteKey(null)
    },
    [colorTokens, updateSiteSettings],
  )

  const handleAdd = useCallback(() => {
    const name = newName.trim()
    const value = newValue.trim()
    const err = validateName(name)
    if (err) { setNameError(err); return }
    if (colorTokens[name] !== undefined) {
      setNameError(`Token "${name}" already exists — edit its value in the list above.`)
      return
    }
    setNameError(null)
    updateSiteSettings({ colorTokens: { ...colorTokens, [name]: value } })
    setNewName('--color-')
    setNewValue('#000000')
  }, [newName, newValue, colorTokens, updateSiteSettings])

  if (!site) {
    return <div className={s.noSite}>Loading site...</div>
  }

  return (
    <div>
      <h3 className={s.sectionHeading}>Colors</h3>
      <p className={s.sectionDescription}>
        Global CSS custom properties injected as{' '}
        <code>:root {'{ … }'}</code> in the exported HTML.
        Reference tokens in module CSS as{' '}
        <code>var(--color-brand)</code>.
      </p>

      {/* ── Token list ──────────────────────────────────────────────────── */}
      {entries.length === 0 ? (
        <p className={s.colorNote}>No tokens yet. Add one below.</p>
      ) : (
        <ul role="list" aria-label="Color tokens" className={s.colorList}>
          {entries.map(([key, value]) => (
            <li
              key={key}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation()
                  setConfirmDeleteKey(null)
                }
              }}
              className={s.colorItem}
            >
              {/* Color swatch */}
              <ColorInput
                value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'}
                onChange={(e) => handleUpdateValue(key, e.target.value)}
                aria-label={`Color swatch for ${key}`}
                fieldSize="sm"
              />

              {/* Token name */}
              <div className={s.colorTokenInfo}>
                <div className={s.colorTokenName}>{key}</div>
              </div>

              {/* Raw value input */}
              <Input
                type="text"
                value={value}
                onChange={(e) => handleUpdateValue(key, e.target.value)}
                aria-label={`Value for ${key}`}
                monospace
                className={s.colorInput}
              />

              {/* Remove button / inline confirm */}
              {confirmDeleteKey === key ? (
                <div className={s.colorTokenActions}>
                  <Button
                    ref={confirmBtnRef}
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(key)}
                    aria-label={`Confirm remove ${key}`}
                  >
                    Confirm
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setConfirmDeleteKey(null)}
                    aria-label="Cancel remove"
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmDeleteKey(key)}
                  aria-label={`Remove token ${key}`}
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* ── Add new token ─────────────────────────────────────────────────── */}
      <div className={s.colorAddForm}>
        <h4 className={s.colorAddTitle}>Add Token</h4>

        <div className={s.colorAddRow}>
          {/* Name */}
          <Input
            type="text"
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value)
              setNameError(null)
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="--color-brand"
            aria-label="New token name"
            aria-describedby={nameError ? 'color-name-error' : undefined}
            invalid={Boolean(nameError)}
            monospace
            className={s.fieldFlex}
          />

          {/* Color picker */}
          <ColorInput
            value={/^#[0-9a-fA-F]{6}$/.test(newValue) ? newValue : '#000000'}
            onChange={(e) => setNewValue(e.target.value)}
            aria-label="New token color"
            fieldSize="sm"
          />

          {/* Raw value */}
          <Input
            type="text"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="#000000"
            aria-label="New token value"
            monospace
            className={s.colorInput}
          />

          {/* Add button */}
          <Button
            variant="primary"
            size="md"
            onClick={handleAdd}
            disabled={!newName.trim() || !newValue.trim()}
          >
            + Add
          </Button>
        </div>

        {nameError && (
          <p
            id="color-name-error"
            role="alert"
            className={s.colorError}
          >
            {nameError}
          </p>
        )}

        <p className={s.colorNote}>
          Token names must start with <code>--</code> (e.g. <code>--color-brand</code>).
        </p>
      </div>
    </div>
  )
}
