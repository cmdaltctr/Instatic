import { describe, expect, it } from 'bun:test'
import {
  getCmsSetupStatus,
  loginCms,
  logoutCms,
  probeCmsSession,
  setupCms,
} from '../../core/persistence/cmsAuth'

describe('CMS auth client', () => {
  it('loads setup status from the CMS API', async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []
    const status = await getCmsSetupStatus(async (input, init) => {
      calls.push({ input, init })
      return new Response(JSON.stringify({ hasSite: false, hasAdmin: false, needsSetup: true }))
    })

    expect(status).toEqual({ hasSite: false, hasAdmin: false, needsSetup: true })
    expect(calls[0]).toMatchObject({
      input: '/api/cms/setup/status',
      init: { method: 'GET', credentials: 'include' },
    })
  })

  it('creates the initial site and admin account', async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []

    await setupCms({
      siteName: 'Studio Site',
      email: 'owner@example.com',
      password: 'long-enough-password',
    }, async (input, init) => {
      calls.push({ input, init })
      return new Response(JSON.stringify({ ok: true }), { status: 201 })
    })

    expect(calls[0].input).toBe('/api/cms/setup')
    expect(calls[0].init).toMatchObject({
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
    })
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      siteName: 'Studio Site',
      email: 'owner@example.com',
      password: 'long-enough-password',
    })
  })

  it('logs in and out with session credentials', async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []

    await loginCms({
      email: 'owner@example.com',
      password: 'long-enough-password',
    }, async (input, init) => {
      calls.push({ input, init })
      return new Response(JSON.stringify({ ok: true }))
    })

    await logoutCms(async (input, init) => {
      calls.push({ input, init })
      return new Response(JSON.stringify({ ok: true }))
    })

    expect(calls[0]).toMatchObject({
      input: '/api/cms/login',
      init: { method: 'POST', credentials: 'include' },
    })
    expect(calls[1]).toMatchObject({
      input: '/api/cms/logout',
      init: { method: 'POST', credentials: 'include' },
    })
  })

  it('treats a missing draft site as an authenticated empty CMS site', async () => {
    await expect(probeCmsSession(async () =>
      new Response(JSON.stringify({ error: 'draft site not found' }), { status: 404 }),
    )).resolves.toBe(true)

    await expect(probeCmsSession(async () =>
      new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    )).resolves.toBe(false)
  })
})
