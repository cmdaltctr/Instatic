/**
 * Auth-adjacent security helpers — request-side concerns that don't fit
 * inside the auth.ts crypto/session module.
 *
 *   - `isStateChangingMethod`  — POST/PUT/PATCH/DELETE
 *   - `expectedOrigin`         — what the request's Origin *should* be,
 *                                accounting for the X-Forwarded-* headers
 *                                that Caddy sets in compose.tls.yml.
 *   - `originAllowed`          — true when the request's Origin matches the
 *                                expected origin, or is on the dev allowlist.
 *   - `clientIp`               — the IP address used to rate-limit per-attacker.
 *
 * Used by handlers.ts for CSRF defense-in-depth and by the login endpoint
 * for rate limiting.
 */

/** Extra origins allowed by the Origin check (set via env in dev/test). */
const DEV_ORIGIN_ALLOWLIST: string[] = [
  'http://localhost:5173',
  'http://localhost:5174',
  process.env.VITE_ALLOWED_ORIGIN ?? '',
].filter(Boolean)

/** Methods that mutate server state — the only ones the Origin check applies to. */
export function isStateChangingMethod(method: string): boolean {
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE'
}

/**
 * The origin the client *should* be talking to, derived from request headers.
 *
 * When behind a reverse proxy (Caddy → app:3001), `req.url` reports the
 * upstream backend address. We trust `X-Forwarded-Proto` and
 * `X-Forwarded-Host` to recover the user-facing origin. Falls back to the
 * inbound `Host` header and finally to `req.url` for direct connections.
 */
export function expectedOrigin(req: Request): string {
  const fallback = new URL(req.url)
  const proto = (req.headers.get('x-forwarded-proto') ?? fallback.protocol.replace(':', '')).toLowerCase()
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? fallback.host
  return `${proto}://${host}`
}

/**
 * True when the request's `Origin` header is acceptable for a state-changing
 * action. The check is a CSRF defense-in-depth on top of `SameSite=Lax`:
 *
 *   - No Origin header → trust (curl, server-to-server, same-origin form
 *     POST in some browsers); cannot be a cross-origin browser fetch since
 *     all modern browsers send Origin for CORS-significant requests.
 *   - Origin matches expectedOrigin(req) → same-origin, allow.
 *   - Origin is in the dev allowlist (Vite at :5173, etc.) → allow.
 *   - Anything else → reject.
 */
export function originAllowed(req: Request): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return true
  if (origin === expectedOrigin(req)) return true
  return DEV_ORIGIN_ALLOWLIST.includes(origin)
}

/**
 * Best-effort client IP. Reads `X-Forwarded-For` (set by Caddy) first; falls
 * back to a per-request placeholder. Used as part of the rate-limit key so
 * an attacker can't multiply their throughput across IPs trivially when
 * behind a real reverse proxy.
 *
 * Note: when running without a proxy and Bun.serve doesn't surface the
 * client IP into the Request object, the fallback is "unknown", which means
 * rate limiting effectively becomes per-email-only. That is still a useful
 * defense against single-account brute force.
 */
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    // XFF may be a comma-separated chain (most-recent-proxy first by spec).
    // The first entry is the original client.
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  return 'unknown'
}
