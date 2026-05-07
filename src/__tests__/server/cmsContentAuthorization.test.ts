import { afterEach, describe, expect, it } from 'bun:test'
import { handleCmsRequest } from '../../../server/handlers/cms'
import type { DbClient } from '../../../server/db'
import { createTestDb, type TestDb } from '../helpers/createTestDb'

const ownedPassword = 'long-enough-password'

async function body(res: Response): Promise<Record<string, unknown>> {
  return res.json() as Promise<Record<string, unknown>>
}

async function request(
  db: DbClient,
  path: string,
  options: RequestInit & { cookie?: string } = {},
): Promise<Response> {
  const headers = new Headers(options.headers)
  if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json')
  const req = new Request(`http://localhost${path}`, {
    ...options,
    headers,
  })
  if (options.cookie) req.headers.set('cookie', options.cookie)
  return handleCmsRequest(req, db)
}

async function setupOwner(db: DbClient): Promise<string> {
  const setup = await request(db, '/admin/api/cms/setup', {
    method: 'POST',
    body: JSON.stringify({
      siteName: 'Ownership Test',
      email: 'owner@example.com',
      password: ownedPassword,
    }),
  })
  expect(setup.status).toBe(201)
  return login(db, 'owner@example.com')
}

async function login(db: DbClient, email: string): Promise<string> {
  const res = await request(db, '/admin/api/cms/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: ownedPassword }),
  })
  expect(res.status).toBe(200)
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
  expect(cookie).toContain('pb_admin_session=')
  return cookie
}

async function createUser(
  db: DbClient,
  ownerCookie: string,
  input: { email: string; displayName: string; roleId: string },
): Promise<string> {
  const res = await request(db, '/admin/api/cms/users', {
    method: 'POST',
    cookie: ownerCookie,
    body: JSON.stringify({ ...input, password: ownedPassword }),
  })
  expect(res.status).toBe(201)
  const payload = await body(res) as { user: { id: string } }
  return payload.user.id
}

async function createEntry(
  db: DbClient,
  cookie: string,
  title: string,
): Promise<string> {
  const res = await request(db, '/admin/api/cms/content/collections/posts/entries', {
    method: 'POST',
    cookie,
    body: JSON.stringify({ title }),
  })
  expect(res.status).toBe(201)
  const payload = await body(res) as { entry: { id: string } }
  return payload.entry.id
}

describe('CMS content ownership authorization', () => {
  const cleanupFns: Array<() => Promise<void>> = []

  afterEach(async () => {
    while (cleanupFns.length) await cleanupFns.pop()?.()
  })

  async function makeDb(): Promise<TestDb> {
    const testDb = await createTestDb()
    cleanupFns.push(testDb.cleanup)
    return testDb
  }

  it('filters own-edit users to their entries and lets any-edit users see all entries', async () => {
    const { db } = await makeDb()
    const ownerCookie = await setupOwner(db)
    await createUser(db, ownerCookie, { email: 'editor-one@example.com', displayName: 'Editor One', roleId: 'editor' })
    await createUser(db, ownerCookie, { email: 'editor-two@example.com', displayName: 'Editor Two', roleId: 'editor' })
    await createUser(db, ownerCookie, { email: 'manager@example.com', displayName: 'Manager', roleId: 'content-manager' })
    const editorOneCookie = await login(db, 'editor-one@example.com')
    const editorTwoCookie = await login(db, 'editor-two@example.com')
    const managerCookie = await login(db, 'manager@example.com')

    await createEntry(db, editorOneCookie, 'Editor One Draft')
    await createEntry(db, editorTwoCookie, 'Editor Two Draft')

    const ownList = await request(db, '/admin/api/cms/content/collections/posts/entries', {
      method: 'GET',
      cookie: editorOneCookie,
    })
    expect(ownList.status).toBe(200)
    expect((await body(ownList)).entries).toMatchObject([{ title: 'Editor One Draft' }])
    expect(((await body(await request(db, '/admin/api/cms/content/collections/posts/entries', {
      method: 'GET',
      cookie: managerCookie,
    }))).entries as Array<{ title: string }>).map((entry) => entry.title).sort()).toEqual([
      'Editor One Draft',
      'Editor Two Draft',
    ])
  })

  it('blocks own-edit users from mutating entries owned by someone else', async () => {
    const { db } = await makeDb()
    const ownerCookie = await setupOwner(db)
    const editorTwoId = await createUser(db, ownerCookie, {
      email: 'second-editor@example.com',
      displayName: 'Second Editor',
      roleId: 'editor',
    })
    await createUser(db, ownerCookie, { email: 'first-editor@example.com', displayName: 'First Editor', roleId: 'editor' })
    const firstEditorCookie = await login(db, 'first-editor@example.com')
    const secondEditorCookie = await login(db, 'second-editor@example.com')
    const secondEntryId = await createEntry(db, secondEditorCookie, 'Second Editor Draft')

    const readOther = await request(db, `/admin/api/cms/content/entries/${secondEntryId}`, {
      method: 'GET',
      cookie: firstEditorCookie,
    })
    expect(readOther.status).toBe(403)

    const saveOther = await request(db, `/admin/api/cms/content/entries/${secondEntryId}`, {
      method: 'PUT',
      cookie: firstEditorCookie,
      body: JSON.stringify({
        title: 'Hijacked',
        slug: 'hijacked',
        bodyMarkdown: '',
        featuredMediaId: null,
        seoTitle: '',
        seoDescription: '',
      }),
    })
    expect(saveOther.status).toBe(403)

    const reassignOther = await request(db, `/admin/api/cms/content/entries/${secondEntryId}/author`, {
      method: 'PATCH',
      cookie: firstEditorCookie,
      body: JSON.stringify({ authorUserId: editorTwoId }),
    })
    expect(reassignOther.status).toBe(403)
  })

  it('lets own-publish users publish their entries and any-edit users reassign authors', async () => {
    const { db } = await makeDb()
    const ownerCookie = await setupOwner(db)
    const editorOneId = await createUser(db, ownerCookie, {
      email: 'publish-editor@example.com',
      displayName: 'Publish Editor',
      roleId: 'editor',
    })
    const managerId = await createUser(db, ownerCookie, {
      email: 'assign-manager@example.com',
      displayName: 'Assign Manager',
      roleId: 'content-manager',
    })
    const editorCookie = await login(db, 'publish-editor@example.com')
    const managerCookie = await login(db, 'assign-manager@example.com')
    const entryId = await createEntry(db, editorCookie, 'Publishable Draft')

    const publish = await request(db, `/admin/api/cms/content/entries/${entryId}/publish`, {
      method: 'POST',
      cookie: editorCookie,
    })
    expect(publish.status).toBe(200)
    expect(await body(publish)).toMatchObject({ entry: { status: 'published', authorUserId: editorOneId } })

    const reassign = await request(db, `/admin/api/cms/content/entries/${entryId}/author`, {
      method: 'PATCH',
      cookie: managerCookie,
      body: JSON.stringify({ authorUserId: managerId }),
    })
    expect(reassign.status).toBe(200)
    expect(await body(reassign)).toMatchObject({ entry: { authorUserId: managerId } })
  })
})
