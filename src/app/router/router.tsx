import { createBrowserRouter } from 'react-router'

import { clearCurrentSession, currentSessionQueryKey } from '@/entities/session'
import { DashboardPage } from '@/pages/dashboard'
import { LoginPage } from '@/pages/login'
import { authGetMe } from '@/shared/api'

import { queryClient } from '../config/query-client'
import {
  createRedirectAuthenticatedLoader,
  createRequireSessionLoader,
} from './loaders'
import { RouteError } from './route-error'

async function loadSession(signal: AbortSignal) {
  const session = await authGetMe(undefined, signal)
  if (signal.aborted) {
    throw new DOMException('The session request was aborted', 'AbortError')
  }
  queryClient.setQueryData(currentSessionQueryKey(), session)
  return session
}

/** Маршрутизатор приложения с защитой приватного дашборда. */
export const router = createBrowserRouter([
  {
    path: '/',
    loader: createRequireSessionLoader({
      load: loadSession,
      clear: () => clearCurrentSession(queryClient),
    }),
    element: <DashboardPage />,
    errorElement: <RouteError />,
  },
  {
    path: '/login',
    loader: createRedirectAuthenticatedLoader({ load: loadSession }),
    element: <LoginPage />,
    errorElement: <RouteError />,
  },
])
