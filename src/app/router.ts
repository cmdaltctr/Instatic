import { createElement, lazy, Suspense } from 'react'
import type { ReactElement } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLoadingScreen } from './AppLoadingScreen'

const AdminEntry = lazy(() => import('./AdminEntry'))

function withSuspense(element: ReactElement) {
  return createElement(
    Suspense,
    { fallback: createElement(AppLoadingScreen) },
    element,
  )
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: createElement(Navigate, { to: '/admin', replace: true }),
  },
  {
    path: '/admin',
    element: withSuspense(createElement(AdminEntry)),
  },
])
