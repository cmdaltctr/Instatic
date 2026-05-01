import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

describe('admin CMS route wiring', () => {
  it('routes /admin to the editor in CMS persistence mode', () => {
    const router = readFileSync(join(root, 'src/app/router.ts'), 'utf8')

    expect(router).toContain("path: '/admin'")
    expect(router).toContain('AdminEntry')
  })

  it('uses the server CMS adapter without local last-project tracking', () => {
    const editor = readFileSync(join(root, 'src/app/EditorLayout.tsx'), 'utf8')

    expect(editor).toContain('cmsAdapter')
    expect(editor).toContain('rememberLastProject: false')
  })

  it('gates the CMS editor behind setup and login checks', () => {
    const admin = readFileSync(join(root, 'src/app/AdminEntry.tsx'), 'utf8')

    expect(admin).toContain('getCmsSetupStatus')
    expect(admin).toContain('probeCmsSession')
    expect(admin).toContain('setupCms')
    expect(admin).toContain('loginCms')
    expect(admin).toContain('persistenceMode="cms"')
  })

  it('uses a submit button for setup and login forms', () => {
    const admin = readFileSync(join(root, 'src/app/AdminEntry.tsx'), 'utf8')

    expect(admin).toContain('type="submit"')
  })
})
