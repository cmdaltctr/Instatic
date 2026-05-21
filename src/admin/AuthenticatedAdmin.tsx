/**
 * AuthenticatedAdmin — the heavy admin shell.
 *
 * This file owns everything the login screen does NOT need:
 *   - SpotlightRoot (Cmd+K palette) + its keybinding listener
 *   - AdminSessionProvider (session context for authenticated children)
 *   - StepUpProvider (auth re-verification for sensitive actions)
 *   - The 9 workspace page components (DashboardPage, SitePage, …)
 *   - installPluginRuntime() (populates globalThis.__pagebuilder for plugins)
 *
 * Splitting this out from `AdminEntry` keeps the cold-load JS execution
 * gap small for the unauthenticated login flow: the entry chunk no longer
 * has to module-evaluate all of the above on the login screen.
 *
 * The component is loaded by `AdminEntry` via React.lazy when (and only
 * when) the boot probe resolves to `phase === 'editor'`.
 *
 * Workspace pages are EAGERLY imported (not behind `React.lazy`). The
 * earlier `React.lazy` approach had a subtle problem: even after a
 * pre-warm completed the underlying module, React.lazy's loader returns
 * a NEW `import(...).then(...)` chain on every call — the `.then` step
 * is a fresh microtask, which causes Suspense to fall back to its
 * `AppLoadingScreen` for ONE TICK on every navigation, even when the
 * module is already cached. The user perceives that one-tick flash as
 * a "loading screen flicker" between every nav click. Eager imports
 * fold the workspace pages directly into AuthenticatedAdmin's chunk —
 * Suspense doesn't fire at all on navigation, transitions are truly
 * synchronous, and the nav feels instant.
 *
 * Cost: the AuthenticatedAdmin chunk gets bigger (the 9 page chunks
 * are merged into it). Pre-release, on a self-hosted broadband target,
 * that's the right trade. AdminCanvasLayout / CodeMirrorEditor remain
 * lazy inside SitePage so the editor still loads on demand — what's
 * eager here is just the top-level workspace shells.
 */
import { Suspense } from 'react'
import type { CmsCurrentUser } from '@core/persistence'
import { AppLoadingScreen } from './AppLoadingScreen'
import type { AdminWorkspace } from './workspace'
import { AdminSessionProvider } from './session'
import { StepUpProvider } from './shared/StepUp'
import { canAccessWorkspace, firstAccessibleWorkspace, workspacePath } from './access'
import { Navigate, useInRouterContext } from './lib/routing'
import { SpotlightRoot } from './spotlight'
import { installPluginRuntime } from './pluginRuntimeBootstrap'
import styles from './AdminEntry.module.css'

// Eager imports — see the docstring above for why.
import { DashboardPage } from './pages/dashboard/DashboardPage'
import { SitePage } from './pages/site/SitePage'
import { ContentPage } from './pages/content/ContentPage'
import { MediaPage } from './pages/media/MediaPage'
import { PluginsPage } from './pages/plugins/PluginsPage'
import { PluginPage } from './pages/plugins/PluginPage'
import { UsersPage } from './pages/users/UsersPage'
import { AccountPage } from './pages/account/AccountPage'
import { DataPage } from './pages/data/DataPage'

// Populate globalThis.__pagebuilder for plugin chunks. Idempotent — runs
// only when this lazy chunk evaluates, which is AFTER login. Plugins are
// loaded by AuthenticatedAdmin's downstream children (e.g. PluginsPage),
// so the runtime is always ready before any plugin chunk evaluates.
installPluginRuntime()

interface AuthenticatedAdminProps {
  section: AdminWorkspace
  currentUser: CmsCurrentUser
}

export default function AuthenticatedAdmin({ section, currentUser }: AuthenticatedAdminProps) {
  const inRouter = useInRouterContext()
  const fallbackWorkspace = firstAccessibleWorkspace(currentUser)

  if (!canAccessWorkspace(currentUser, section)) {
    if (inRouter && fallbackWorkspace) {
      return <Navigate to={workspacePath(fallbackWorkspace)} replace />
    }
    return (
      <main className={styles.page}>
        <section className={styles.panel} role="alert">
          <h1 className={styles.title}>Access unavailable</h1>
          <p className={styles.error}>Your role does not include access to this admin section.</p>
        </section>
      </main>
    )
  }

  return (
    <AdminSessionProvider user={currentUser}>
      {/* StepUpProvider wraps SpotlightRoot so spotlight commands can
          consume `useStepUp()` — required by step-up-gated actions invoked
          from the palette (e.g. `editor.publish`). Both providers stay
          inside AdminSessionProvider (the palette's CommandContext reads
          the authenticated user) and above the workspace switch so the
          palette and the step-up dialog are available across every
          workspace. */}
      <StepUpProvider>
        <SpotlightRoot>
          {/* Suspense kept for downstream `lazy()` inside pages (e.g.
              SitePage → AdminCanvasLayout). The page components themselves
              are eager (see the file header), so workspace-to-workspace
              navigation does NOT fall back through here. */}
          <Suspense fallback={<AppLoadingScreen />}>
            {section === 'dashboard' ? <DashboardPage /> :
              section === 'site' ? <SitePage /> :
              section === 'content' ? <ContentPage /> :
              section === 'data' ? <DataPage /> :
              section === 'media' ? <MediaPage /> :
              section === 'plugins' ? <PluginsPage /> :
              section === 'users' ? <UsersPage /> :
              section === 'pluginPage' ? <PluginPage /> :
              section === 'account' ? <AccountPage /> :
              <DashboardPage />}
          </Suspense>
        </SpotlightRoot>
      </StepUpProvider>
    </AdminSessionProvider>
  )
}
