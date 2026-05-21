import { lazy, Suspense, useState } from 'react'
import type { CmsCurrentUser } from '@core/persistence'
import { AppLoadingScreen } from './AppLoadingScreen'
import type { AdminWorkspace } from './workspace'
import { AdminPreAuthForm, type PreAuthPhase } from './preauth/AdminPreAuthForm'
import { useAdminBoot } from './preauth/useAdminBoot'

// AuthenticatedAdmin lives in its own chunk so the cold /admin login screen
// never downloads / evaluates SpotlightRoot, AdminSessionProvider,
// StepUpProvider, installPluginRuntime, or any of the per-workspace page
// chunks. The chunk only fires when `boot.phase === 'editor'` — i.e. after
// a successful login. Cold-load JS execution gap drops by ~50–100 ms
// because the browser doesn't compile + execute the authenticated
// provider tree during the unauthenticated boot probe.
const AuthenticatedAdmin = lazy(() => import('./AuthenticatedAdmin'))

type AdminSection = AdminWorkspace

// After boot, the pre-auth form can lift us into MFA or into the editor.
// `null` means "follow whatever the boot hook resolved to" — the form has
// not produced a transition yet.
type PreAuthOverride =
  | { phase: PreAuthPhase }
  | { phase: 'editor'; user: CmsCurrentUser }

interface AdminEntryProps {
  section?: AdminSection
}

export default function AdminEntry({ section = 'dashboard' }: AdminEntryProps) {
  const boot = useAdminBoot()
  const [override, setOverride] = useState<PreAuthOverride | null>(null)

  if (boot.status === 'loading') return <AppLoadingScreen />

  const livePhase = override?.phase ?? boot.phase
  const liveUser =
    override?.phase === 'editor' ? override.user : boot.currentUser

  if (livePhase === 'editor') {
    if (!liveUser) return <AppLoadingScreen />
    return (
      <Suspense fallback={<AppLoadingScreen />}>
        <AuthenticatedAdmin section={section} currentUser={liveUser} />
      </Suspense>
    )
  }

  return (
    <AdminPreAuthForm
      phase={livePhase}
      publicSite={boot.publicSite}
      initialError={boot.initialError}
      onPhaseChange={(phase) => setOverride({ phase })}
      onAuthenticated={(user) => setOverride({ phase: 'editor', user })}
    />
  )
}
