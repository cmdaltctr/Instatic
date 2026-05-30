/**
 * useUsersPageData — central data store for the Users workspace.
 *
 * Loads users, roles, and audit events in parallel from the CMS API, gated
 * by the caller-supplied `access` flags. The Users tab needs `users` and
 * `roles`; the Roles tab needs `roles`; the Audit tab needs `events` plus
 * `users`/`roles` to enrich the displayed labels. Loading them all at once
 * keeps tab-switching instant and matches the per-tab capability gates
 * applied by the page shell.
 *
 * Returns mutable state setters so each tab can do optimistic updates after
 * a successful save (avoids the round-trip flicker), then call `refresh()`
 * to reconcile authoritative state from the server.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  listCmsAuditEvents,
  listCmsRoles,
  listCmsUsers,
  type CmsAuditEvent,
  type CmsCurrentUser,
  type CmsRole,
} from '@core/persistence'
import { emptyUserForm, type UsersPageLoadAccess } from '../types'

interface LoadedData {
  users: CmsCurrentUser[]
  roles: CmsRole[]
  events: CmsAuditEvent[]
}

export interface UsersPageData {
  users: CmsCurrentUser[]
  roles: CmsRole[]
  events: CmsAuditEvent[]
  /**
   * True while the initial load is in flight. Surfaces so the page
   * shell can show the universal skeleton instead of an empty list /
   * "no users" message during the round-trip.
   */
  isLoading: boolean
  error: string | null
  /**
   * The first role id that admins can assign to a user (i.e. excludes the
   * Owner role). Used to seed the create-user dialog so it never opens
   * with a stale or impossible role selection.
   */
  defaultAssignableRoleId: string
  setUsers: (updater: (current: CmsCurrentUser[]) => CmsCurrentUser[]) => void
  setRoles: (updater: (current: CmsRole[]) => CmsRole[]) => void
  setError: (value: string | null) => void
  refresh: () => Promise<void>
}

async function loadUsersPageData(access: UsersPageLoadAccess): Promise<LoadedData> {
  const [users, roles, events] = await Promise.all([
    access.canManageUsers ? listCmsUsers() : Promise.resolve([]),
    access.canReadRoleOptions ? listCmsRoles() : Promise.resolve([]),
    access.canReadAudit ? listCmsAuditEvents() : Promise.resolve([]),
  ])
  return { users, roles, events }
}

export function useUsersPageData(access: UsersPageLoadAccess): UsersPageData {
  const [users, setUsers] = useState<CmsCurrentUser[]>([])
  const [roles, setRoles] = useState<CmsRole[]>([])
  const [events, setEvents] = useState<CmsAuditEvent[]>([])
  // `isLoading` flips to false only after the FIRST round-trip
  // completes. Without this, the page would render the "No users yet"
  // empty state for the ~50-200 ms window between mount and first
  // response — visually identical to a fresh install and tragic UX.
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Exception #1 (react-hooks/exhaustive-deps): feeds the load effect's
  // dep array, so it needs a stable identity the static lint can see.
  const loadAccess = useCallback(
    (): UsersPageLoadAccess => ({
      canManageUsers: access.canManageUsers,
      canReadRoleOptions: access.canReadRoleOptions,
      canReadAudit: access.canReadAudit,
    }),
    [access.canManageUsers, access.canReadRoleOptions, access.canReadAudit],
  )

  // Exception #1 (react-hooks/exhaustive-deps): feeds the load effect's
  // dep array, so it needs a stable identity the static lint can see.
  const applyLoadedData = useCallback((data: LoadedData) => {
    setUsers(data.users)
    setRoles(data.roles)
    setEvents(data.events)
  }, [])

  const refresh = async () => {
    setError(null)
    try {
      applyLoadedData(await loadUsersPageData(loadAccess()))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load users')
    }
  }

  useEffect(() => {
    let cancelled = false
    void loadUsersPageData(loadAccess())
      .then((data) => {
        if (!cancelled) applyLoadedData(data)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load users')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [applyLoadedData, loadAccess])

  const defaultAssignableRoleId =
    roles.find((role) => role.id !== 'owner')?.id ?? emptyUserForm.roleId

  return {
    users,
    roles,
    events,
    isLoading,
    error,
    defaultAssignableRoleId,
    setUsers,
    setRoles,
    setError,
    refresh,
  }
}
