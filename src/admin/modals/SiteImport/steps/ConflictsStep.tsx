/**
 * ConflictsStep — the third step of the Super Import wizard.
 *
 * Shows page slug conflicts and class name conflicts with resolution pickers.
 * Each row uses `ConflictRow` to let the user choose between auto-rename,
 * overwrite, skip, or a custom value.
 *
 * The modal's Next handler auto-skips this step when there are no conflicts
 * after selection filtering. This component guards with an early return just
 * in case it's rendered without conflicts.
 */
import type { ImportPlan, ConflictResolution } from '@core/siteImport'
import { ConflictRow } from '../shared/ConflictRow'
import styles from './ConflictsStep.module.css'

interface ConflictsStepProps {
  plan: ImportPlan
  pageResolutions: Map<string, ConflictResolution>
  ruleResolutions: Map<string, ConflictResolution>
  onPageResolutionChange: (source: string, resolution: ConflictResolution) => void
  onRuleResolutionChange: (desiredName: string, resolution: ConflictResolution) => void
}

export function ConflictsStep({
  plan,
  pageResolutions,
  ruleResolutions,
  onPageResolutionChange,
  onRuleResolutionChange,
}: ConflictsStepProps) {
  const { pages: pageConflicts, rules: ruleConflicts } = plan.conflicts

  if (pageConflicts.length === 0 && ruleConflicts.length === 0) {
    return null
  }

  return (
    <div className={styles.wrapper}>
      {pageConflicts.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.heading}>
            Page slug conflicts ({pageConflicts.length})
          </h3>
          <p className={styles.hint}>
            These pages share a slug with an existing page. Choose how to resolve each one.
          </p>
          <div className={styles.rows}>
            {pageConflicts.map((conflict) => (
              <ConflictRow
                key={conflict.source}
                kind="page"
                source={conflict.source}
                desired={conflict.desiredSlug}
                current={pageResolutions.get(conflict.source) ?? conflict.defaultResolution}
                onChange={(next) => onPageResolutionChange(conflict.source, next)}
              />
            ))}
          </div>
        </section>
      )}

      {ruleConflicts.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.heading}>
            Class name conflicts ({ruleConflicts.length})
          </h3>
          <p className={styles.hint}>
            These class names are already used in this site's style registry.
          </p>
          <div className={styles.rows}>
            {ruleConflicts.map((conflict) => (
              <ConflictRow
                key={conflict.desiredName}
                kind="rule"
                source={conflict.source}
                desired={conflict.desiredName}
                current={ruleResolutions.get(conflict.desiredName) ?? conflict.defaultResolution}
                onChange={(next) => onRuleResolutionChange(conflict.desiredName, next)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
