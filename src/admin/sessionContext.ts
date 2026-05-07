import { createContext, useContext } from 'react'
import type { CmsCurrentUser } from '@core/persistence'

export const AdminSessionContext = createContext<CmsCurrentUser | null>(null)

export function useCurrentAdminUser(): CmsCurrentUser | null {
  return useContext(AdminSessionContext)
}
