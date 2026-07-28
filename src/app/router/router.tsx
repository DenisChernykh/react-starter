import { createBrowserRouter } from 'react-router'

import {
  clearCurrentSession,
  currentSessionQueryOptions,
} from '@/entities/session'
import { DashboardPage } from '@/pages/dashboard'
import { LoginPage } from '@/pages/login'

import { queryClient } from '../config/query-client'
import {
  createRedirectAuthenticatedLoader,
  createRequireSessionLoader,
} from './loaders'
import { RouteError } from './route-error'

const loadSession = () => queryClient.fetchQuery(currentSessionQueryOptions())

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
