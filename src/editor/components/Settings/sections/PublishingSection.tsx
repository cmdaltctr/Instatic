/**
 * PublishingSection — self-hosted CMS publishing details.
 */
import { useEditorStore } from '../../../../core/editor-store/store'
import s from '../Settings.module.css'

export function PublishingSection() {
  const site = useEditorStore((state) => state.site)

  if (!site) {
    return <div className={s.noSite}>Loading site...</div>
  }

  return (
    <div>
      <h3 className={s.sectionHeading}>Publishing</h3>
      <p className={s.sectionDescription}>
        Published pages are served by this self-hosted CMS.
      </p>

      <section aria-labelledby="pub-runtime-heading" className={s.sectionBlock}>
        <h4 id="pub-runtime-heading" className={s.subHeading}>
          Runtime
        </h4>

        <dl className={s.pubRuntimeList}>
          <div>
            <dt>Site</dt>
            <dd>/</dd>
          </div>
          <div>
            <dt>Admin</dt>
            <dd>/admin</dd>
          </div>
          <div>
            <dt>Draft source</dt>
            <dd>Database</dd>
          </div>
        </dl>
      </section>
    </div>
  )
}
