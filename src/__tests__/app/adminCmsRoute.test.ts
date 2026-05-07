import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

describe('admin CMS route wiring', () => {
  it('routes admin sections to the CMS entry and does not expose local site routes', () => {
    const router = readFileSync(join(root, 'src/admin/router.tsx'), 'utf8')

    expect(router).toContain('path="/admin"')
    expect(router).toContain('to="/admin/site"')
    expect(router).toContain('path="/admin/site"')
    expect(router).toContain('path="/admin/content"')
    expect(router).toContain('AdminEntry')
    expect(router).not.toContain('Dashboard')
    expect(router).not.toContain('/editor/:projectId')
    expect(router).not.toContain('/editor/:siteId')
  })

  it('uses the server CMS adapter without local site mode branching', () => {
    const editor = readFileSync(join(root, 'src/admin/AdminLayout.tsx'), 'utf8')

    expect(editor).toContain('cmsAdapter')
    expect(editor).not.toContain('localAdapter')
    expect(editor).not.toContain('persistenceMode')
    expect(editor).not.toContain('mediaMode')
  })

  it('gates the CMS editor behind setup and login checks', () => {
    const admin = readFileSync(join(root, 'src/admin/AdminEntry.tsx'), 'utf8')

    expect(admin).toContain('getCmsSetupStatus')
    expect(admin).toContain('getCurrentCmsUser')
    expect(admin).toContain('setupCms')
    expect(admin).toContain('loginCms')
    expect(admin).toContain('AdminSessionProvider')
    expect(admin).toContain('<SitePage />')
    expect(admin).toContain('<ContentPage />')
  })

  it('uses a submit button for setup and login forms', () => {
    const admin = readFileSync(join(root, 'src/admin/AdminEntry.tsx'), 'utf8')

    expect(admin).toContain('type="submit"')
  })
})
