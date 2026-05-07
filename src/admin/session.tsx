import type { ReactNode } from 'react'
import type { CmsCurrentUser } from '@core/persistence'
import { AdminSessionContext } from './sessionContext'

export function AdminSessionProvider({
  user,
  children,
}: {
  user: CmsCurrentUser
  children: ReactNode
}) {
  return (
    <AdminSessionContext.Provider value={user}>
      {children}
    </AdminSessionContext.Provider>
  )
}
