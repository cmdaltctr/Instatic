import type { DbClient } from '../db/client'
import { SESSION_COOKIE_NAME, hashSessionToken } from './tokens'
import { roleHasCapability, type CoreCapability } from './capabilities'
import { findUserBySessionHash } from './sessions'
import { jsonResponse } from '../http'
import type { AuthUser } from '../repositories/users'

export function readCookie(req: Request, name: string): string {
  const cookie = req.headers.get('cookie') ?? ''
  for (const part of cookie.split(';')) {
    const [rawKey, ...rawValue] = part.trim().split('=')
    if (rawKey === name) return rawValue.join('=')
  }
  return ''
}

export async function getSessionHash(req: Request): Promise<string> {
  const token = readCookie(req, SESSION_COOKIE_NAME)
  return token ? hashSessionToken(token) : ''
}

export async function requireAuthenticatedUser(
  req: Request,
  db: DbClient,
): Promise<AuthUser | Response> {
  const idHash = await getSessionHash(req)
  const user = idHash ? await findUserBySessionHash(db, idHash) : null
  if (!user) return jsonResponse({ error: 'Unauthorized' }, { status: 401 })
  return user
}

export async function requireCapability(
  req: Request,
  db: DbClient,
  capability: CoreCapability,
): Promise<AuthUser | Response> {
  const user = await requireAuthenticatedUser(req, db)
  if (user instanceof Response) return user
  if (!userHasCapability(user, capability)) {
    return jsonResponse({ error: 'Forbidden' }, { status: 403 })
  }
  return user
}

export async function requireAllCapabilities(
  req: Request,
  db: DbClient,
  capabilities: readonly CoreCapability[],
): Promise<AuthUser | Response> {
  const user = await requireAuthenticatedUser(req, db)
  if (user instanceof Response) return user
  if (!capabilities.every((capability) => userHasCapability(user, capability))) {
    return jsonResponse({ error: 'Forbidden' }, { status: 403 })
  }
  return user
}

export function userHasCapability(user: Pick<AuthUser, 'capabilities'>, capability: CoreCapability): boolean {
  return roleHasCapability(user.capabilities, capability)
}

export function userHasAnyCapability(
  user: Pick<AuthUser, 'capabilities'>,
  capabilities: readonly CoreCapability[],
): boolean {
  return capabilities.some((capability) => userHasCapability(user, capability))
}

export async function requireAnyCapability(
  req: Request,
  db: DbClient,
  capabilities: readonly CoreCapability[],
): Promise<AuthUser | Response> {
  const user = await requireAuthenticatedUser(req, db)
  if (user instanceof Response) return user
  if (!userHasAnyCapability(user, capabilities)) {
    return jsonResponse({ error: 'Forbidden' }, { status: 403 })
  }
  return user
}
