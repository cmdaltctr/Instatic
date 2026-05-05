import { describe, expect, it } from 'bun:test'
import { expectedOrigin, isStateChangingMethod, originAllowed, clientIp } from '../../../server/cms/security'

/**
 * Build a Request whose headers contain Fetch-spec "forbidden header names"
 * (Origin, Host, Cookie, etc.) — happy-dom (loaded by the test setup) strips
 * these when set via the Request constructor's `headers` init, but they
 * absolutely DO arrive on the wire when the production Bun.serve receives a
 * real HTTP request. We mutate the Headers object after construction; both
 * happy-dom and Bun's native Request allow that path.
 */
function makeReq(url: string, init: { method?: string; headers?: Record<string, string> } = {}): Request {
  const req = new Request(url, { method: init.method ?? 'GET' })
  for (const [k, v] of Object.entries(init.headers ?? {})) {
    req.headers.set(k, v)
  }
  return req
}

describe('isStateChangingMethod', () => {
  it.each([
    ['POST', true],
    ['PUT', true],
    ['PATCH', true],
    ['DELETE', true],
    ['GET', false],
    ['HEAD', false],
    ['OPTIONS', false],
  ] as const)('%s → %s', (method, expected) => {
    expect(isStateChangingMethod(method)).toBe(expected)
  })
})

describe('expectedOrigin', () => {
  it('uses X-Forwarded-Proto + X-Forwarded-Host when set (Caddy in front)', () => {
    const req = makeReq('http://app:3001/api/cms/login', {
      method: 'POST',
      headers: {
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'cms.example.com',
      },
    })
    expect(expectedOrigin(req)).toBe('https://cms.example.com')
  })

  it('falls back to Host header when no X-Forwarded-Host is present', () => {
    const req = makeReq('http://internal:3001/api/cms/login', {
      method: 'POST',
      headers: { host: 'cms.example.com', 'x-forwarded-proto': 'https' },
    })
    expect(expectedOrigin(req)).toBe('https://cms.example.com')
  })

  it('falls back to the request URL when no proxy headers are present', () => {
    const req = makeReq('http://localhost:3001/api/cms/login', { method: 'POST' })
    expect(expectedOrigin(req)).toBe('http://localhost:3001')
  })
})

describe('originAllowed', () => {
  it('allows requests with no Origin header (curl, server-to-server)', () => {
    const req = makeReq('http://localhost:3001/api/cms/login', { method: 'POST' })
    expect(originAllowed(req)).toBe(true)
  })

  it('allows requests whose Origin matches the expected origin (same-origin)', () => {
    const req = makeReq('http://localhost:3001/api/cms/login', {
      method: 'POST',
      headers: { origin: 'http://localhost:3001' },
    })
    expect(originAllowed(req)).toBe(true)
  })

  it('allows requests from the localhost dev origin (Vite at :5173)', () => {
    const req = makeReq('http://localhost:3001/api/cms/login', {
      method: 'POST',
      headers: { origin: 'http://localhost:5173' },
    })
    expect(originAllowed(req)).toBe(true)
  })

  it('rejects requests from a foreign origin', () => {
    const req = makeReq('http://localhost:3001/api/cms/login', {
      method: 'POST',
      headers: { origin: 'https://evil.example.com' },
    })
    expect(originAllowed(req)).toBe(false)
  })

  it('uses X-Forwarded headers to compute expected origin behind a TLS proxy', () => {
    const req = makeReq('http://app:3001/api/cms/login', {
      method: 'POST',
      headers: {
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'cms.example.com',
        origin: 'https://cms.example.com',
      },
    })
    expect(originAllowed(req)).toBe(true)
  })

  it('rejects an Origin that uses HTTP when the site is HTTPS-only', () => {
    const req = makeReq('http://app:3001/api/cms/login', {
      method: 'POST',
      headers: {
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'cms.example.com',
        origin: 'http://cms.example.com', // wrong scheme
      },
    })
    expect(originAllowed(req)).toBe(false)
  })
})

describe('clientIp', () => {
  it('reads the first entry of X-Forwarded-For (client → proxy chain)', () => {
    const req = makeReq('http://app:3001/api/cms/login', {
      method: 'POST',
      headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' },
    })
    expect(clientIp(req)).toBe('203.0.113.7')
  })

  it('returns "unknown" when no XFF header is present', () => {
    const req = makeReq('http://localhost:3001/api/cms/login', { method: 'POST' })
    expect(clientIp(req)).toBe('unknown')
  })

  it('trims whitespace around XFF entries', () => {
    const req = makeReq('http://app:3001/api/cms/login', {
      method: 'POST',
      headers: { 'x-forwarded-for': '  192.0.2.5  , 10.0.0.1' },
    })
    expect(clientIp(req)).toBe('192.0.2.5')
  })
})
