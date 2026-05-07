import type { CoreCapability } from '../../../auth/capabilities'
import {
  requireAnyCapability,
  requireCapability,
  userHasAnyCapability,
  userHasCapability,
} from '../../../auth/authz'
import type { DbClient } from '../../../db/client'
import { jsonResponse } from '../../../http'
import type { AuthUser } from '../../../repositories/users'

export const CONTENT_ACCESS_CAPABILITIES = [
  'content.create',
  'content.edit.own',
  'content.edit.any',
  'content.publish.own',
  'content.publish.any',
  'content.manage',
] satisfies CoreCapability[]

const CONTENT_ANY_VISIBILITY_CAPABILITIES = [
  'content.edit.any',
  'content.publish.any',
  'content.manage',
] satisfies CoreCapability[]

const CONTENT_OWN_READ_CAPABILITIES = [
  'content.edit.own',
  'content.publish.own',
] satisfies CoreCapability[]

const CONTENT_EDIT_CAPABILITIES = [
  'content.edit.own',
  'content.edit.any',
  'content.manage',
] satisfies CoreCapability[]

const CONTENT_REASSIGN_CAPABILITIES = [
  'content.edit.any',
  'content.manage',
] satisfies CoreCapability[]

const CONTENT_PUBLISH_CAPABILITIES = [
  'content.publish.own',
  'content.publish.any',
] satisfies CoreCapability[]

interface OwnedContentEntry {
  authorUserId: string | null
  createdByUserId: string | null
}

export function forbidden(): Response {
  return jsonResponse({ error: 'Forbidden' }, { status: 403 })
}

export async function requireContentAccess(req: Request, db: DbClient): Promise<AuthUser | Response> {
  return requireAnyCapability(req, db, CONTENT_ACCESS_CAPABILITIES)
}

export async function requireContentManager(req: Request, db: DbClient): Promise<AuthUser | Response> {
  return requireCapability(req, db, 'content.manage')
}

export async function requireContentEditor(req: Request, db: DbClient): Promise<AuthUser | Response> {
  return requireAnyCapability(req, db, CONTENT_EDIT_CAPABILITIES)
}

export async function requireContentCreator(req: Request, db: DbClient): Promise<AuthUser | Response> {
  return requireCapability(req, db, 'content.create')
}

export async function requireContentAuthorManager(req: Request, db: DbClient): Promise<AuthUser | Response> {
  return requireAnyCapability(req, db, CONTENT_REASSIGN_CAPABILITIES)
}

export async function requireContentPublisher(req: Request, db: DbClient): Promise<AuthUser | Response> {
  return requireAnyCapability(req, db, CONTENT_PUBLISH_CAPABILITIES)
}

export function canSeeAllContent(user: AuthUser): boolean {
  return userHasAnyCapability(user, CONTENT_ANY_VISIBILITY_CAPABILITIES)
}

export function ownsContentEntry(user: AuthUser, entry: OwnedContentEntry): boolean {
  return entry.authorUserId === user.id || (!entry.authorUserId && entry.createdByUserId === user.id)
}

export function canReadContentEntry(user: AuthUser, entry: OwnedContentEntry): boolean {
  return canSeeAllContent(user) ||
    (ownsContentEntry(user, entry) && userHasAnyCapability(user, CONTENT_OWN_READ_CAPABILITIES))
}

export function canEditContentEntry(user: AuthUser, entry: OwnedContentEntry): boolean {
  return userHasAnyCapability(user, ['content.edit.any', 'content.manage']) ||
    (ownsContentEntry(user, entry) && userHasCapability(user, 'content.edit.own'))
}

export function canPublishContentEntry(user: AuthUser, entry: OwnedContentEntry): boolean {
  return userHasCapability(user, 'content.publish.any') ||
    (ownsContentEntry(user, entry) && userHasCapability(user, 'content.publish.own'))
}
