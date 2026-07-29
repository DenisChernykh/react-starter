import { createBrowserRouter } from 'react-router'

import { clearCurrentSession, currentSessionQueryKey } from '@/entities/session'
import { ApprovalRequestCreatePage } from '@/pages/approval-request-create'
import { ApprovalRequestDetailsPage } from '@/pages/approval-request-details'
import { ApprovalRequestOpenPage } from '@/pages/approval-request-open'
import { ApprovalRequestsPage } from '@/pages/approval-requests'
import { DashboardPage } from '@/pages/dashboard'
import { LoginPage } from '@/pages/login'
import { authGetMe } from '@/shared/api'

import { queryClient } from '../config/query-client'
import {
  createRedirectAuthenticatedLoader,
  createRequireSessionLoader,
} from './loaders'
import { RouteError } from './route-error'
import { ProtectedLayout } from './protected-layout'

async function loadSession(signal: AbortSignal) {
  const session = await authGetMe(undefined, signal)
  if (signal.aborted) {
    throw new DOMException('The session request was aborted', 'AbortError')
  }
  queryClient.setQueryData(currentSessionQueryKey(), session)
  return session
}

/**
 * Маршрутизатор приложения с общей защитой приватных маршрутов.
 *
 * @remarks Loader protected parent сохраняет успешно загруженную сессию в React
 * Query cache до монтирования dashboard и approval pages. Маршрут `/login`
 * остаётся sibling и перенаправляет уже аутентифицированного пользователя на
 * дашборд.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    loader: createRequireSessionLoader({
      load: loadSession,
      clear: () => clearCurrentSession(queryClient),
    }),
    element: <ProtectedLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <DashboardPage /> },
      {
        path: 'approval-requests',
        element: <ApprovalRequestsPage />,
      },
      {
        path: 'approval-requests/new',
        element: <ApprovalRequestCreatePage />,
      },
      {
        path: 'approval-requests/open',
        element: <ApprovalRequestOpenPage />,
      },
      {
        path: 'approval-requests/:requestId',
        element: <ApprovalRequestDetailsPage />,
      },
    ],
  },
  {
    path: '/login',
    loader: createRedirectAuthenticatedLoader({ load: loadSession }),
    element: <LoginPage />,
    errorElement: <RouteError />,
  },
])
