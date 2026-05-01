/**
 * ComponentRefView — PropertiesPanel view for a selected base.visualComponentRef instance.
 *
 * Architecture source: Contribution #619 §8.5
 *
 * When a visualComponentRef node is selected, this view replaces the normal
 * Properties tab. It shows:
 *   - Header: component icon + VC name + "Open in canvas" link
 *   - One row per VCParam, in vc.params declaration order
 *   - Each row: param name | value editor | status pill (Default / Overridden)
 *   - "Reset" button visible only on overridden params
 *
 * Per-param value editors are type-appropriate:
 *   string | url → text input
 *   number        → number input
 *   boolean       → checkbox
 *   color         → color input
 *   enum          → select
 *
 * Achromatic palette (Guideline #376). CSS Modules only (Constraint #402/#403).
 * Icons from @motion/icons (Guideline #350).
 */

import { useCallback } from 'react'
import { useEditorStore } from '../../../core/editor-store/store'
import { WarningDiamondIcon } from '@ui/icons/icons/warning-diamond'
import { BracesIcon } from '@ui/icons/icons/braces'
import { ExternalLinkIcon } from '@ui/icons/icons/external-link'
import { UndoIcon } from '@ui/icons/icons/undo'
import { Button } from '@ui/components/Button'
import { Input } from '@ui/components/Input'
import { Select } from '@ui/components/Select'
import { Switch } from '@ui/components/Switch'
import { ColorInput } from '@ui/components/ColorInput'
import styles from './ComponentRefView.module.css'

interface ComponentRefViewProps {
  /** ID of the selected base.visualComponentRef node */
  nodeId: string
  /** componentId prop from the node — identifies which VC this references */
  componentId: string
  /** propOverrides prop from the node — per-instance value overrides */
  propOverrides: Record<string, unknown>
}

export function ComponentRefView({ nodeId, componentId, propOverrides }: ComponentRefViewProps) {
  const setActiveDocument = useEditorStore((s) => s.setActiveDocument)
  const updateNodeProps = useEditorStore((s) => s.updateNodeProps)

  const vc = useEditorStore(
    useCallback(
      (s) => s.site?.visualComponents?.find((v) => v.id === componentId) ?? null,
      [componentId],
    ),
  )

  function handleOpenInCanvas() {
    if (componentId) {
      setActiveDocument({ kind: 'visualComponent', vcId: componentId })
    }
  }

  function handleParamChange(paramName: string, value: unknown) {
    const next = { ...propOverrides, [paramName]: value }
    updateNodeProps(nodeId, { propOverrides: next })
  }

  function handleParamReset(paramName: string) {
    const next = { ...propOverrides }
    delete next[paramName]
    updateNodeProps(nodeId, { propOverrides: next })
  }

  if (!vc) {
    return (
      <div className={styles.unknownVC}>
        <WarningDiamondIcon size={14} color="currentColor" aria-hidden="true" />
        <p>Unknown component: {componentId}</p>
      </div>
    )
  }

  return (
    <>
      {/* ── Header: VC name + Open in canvas link ──────────────────────── */}
      <div className={styles.header}>
        <span className={styles.headerIcon} aria-hidden="true">
          <BracesIcon size={12} color="currentColor" />
        </span>
        <span className={styles.headerName}>{vc.name}</span>
        <Button
          variant="ghost"
          size="xs"
          onClick={handleOpenInCanvas}
          title="Open component in canvas"
        >
          <ExternalLinkIcon size={10} color="currentColor" aria-hidden="true" />
          Open in canvas
        </Button>
      </div>

      {/* ── Param rows ──────────────────────────────────────────────────── */}
      {vc.params.length === 0 ? (
        <div className={styles.noParams}>
          This component has no exposed parameters.
          <br />
          Open it in canvas to add parameters.
        </div>
      ) : (
        <div className={styles.paramsList} role="list" aria-label="Component parameters">
          {vc.params.map((param) => {
            const isOverridden = Object.prototype.hasOwnProperty.call(propOverrides, param.name)
            const effectiveValue = isOverridden
              ? propOverrides[param.name]
              : param.defaultValue

            return (
              <div
                key={param.id}
                className={`${styles.paramRow} ${isOverridden ? styles.paramRowOverridden : ''}`}
                role="listitem"
                data-testid={`vc-param-row-${param.name}`}
              >
                <span
                  className={styles.paramName}
                  title={param.name}
                >
                  {param.name}
                </span>

                {/* Type-appropriate value editor */}
                <ParamInput
                  param={param}
                  value={effectiveValue}
                  onChange={(v) => handleParamChange(param.name, v)}
                />

                {/* Status pill */}
                <span className={styles.overridePill}>
                  {isOverridden ? 'Overridden' : 'Default'}
                </span>

                {/* Reset button — only when overridden */}
                {isOverridden && (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => handleParamReset(param.name)}
                    title="Reset to default"
                    aria-label={`Reset ${param.name} to default`}
                  >
                    <UndoIcon size={10} color="currentColor" aria-hidden="true" />
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// ParamInput — type-appropriate value editor for a single VCParam
// ---------------------------------------------------------------------------

import type { VCParam } from '../../../core/visualComponents/types'

interface ParamInputProps {
  param: VCParam
  value: unknown
  onChange: (value: unknown) => void
}

function ParamInput({ param, value, onChange }: ParamInputProps) {
  const strVal = value === null || value === undefined ? '' : String(value)

  switch (param.type) {
    case 'boolean':
      return (
        <Switch
          checked={Boolean(value)}
          onCheckedChange={onChange}
          switchSize="sm"
          className={styles.paramSwitch}
          data-testid={`vc-param-input-${param.name}`}
        />
      )

    case 'number':
      return (
        <Input
          type="number"
          value={strVal}
          onChange={(e) => onChange(e.target.valueAsNumber)}
          fieldSize="xs"
          className={styles.paramField}
          data-testid={`vc-param-input-${param.name}`}
        />
      )

    case 'color':
      return (
        <ColorInput
          value={strVal || '#000000'}
          onChange={(e) => onChange(e.target.value)}
          fieldSize="xs"
          data-testid={`vc-param-input-${param.name}`}
        />
      )

    case 'enum':
      return (
        <Select
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
          fieldSize="xs"
          className={styles.paramField}
          data-testid={`vc-param-input-${param.name}`}
        >
          {(param.enumOptions ?? []).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </Select>
      )

    case 'string':
    case 'url':
    default:
      return (
        <Input
          type={param.type === 'url' ? 'url' : 'text'}
          value={strVal}
          placeholder={`${param.name}…`}
          onChange={(e) => onChange(e.target.value)}
          fieldSize="xs"
          className={styles.paramField}
          data-testid={`vc-param-input-${param.name}`}
        />
      )
  }
}
