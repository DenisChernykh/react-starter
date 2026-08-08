import { createBrowserRouter } from 'react-router'

import { clearCurrentSession, currentSessionQueryKey } from '@/entities/session'
import { ApprovalRequestCreatePage } from '@/pages/approval-request-create'
import { ApprovalRequestDetailsPage } from '@/pages/approval-request-details'
import { ApprovalRequestOpenPage } from '@/pages/approval-request-open'
import { ApprovalRequestsPage } from '@/pages/approval-requests'
import { AdminAccountDetailsPage } from '@/pages/admin-account-details'
import { AdminAccountsPage } from '@/pages/admin-accounts'
import { AcceptAccountInvitationPage } from '@/pages/accept-account-invitation'
import { DashboardPage } from '@/pages/dashboard'
import { ForgotPasswordPage } from '@/pages/forgot-password'
import { LoginPage } from '@/pages/login'
import { RegisterPage } from '@/pages/register'
import { ResendEmailVerificationPage } from '@/pages/resend-email-verification'
import { ResetPasswordPage } from '@/pages/reset-password'
import { VerifyEmailPage } from '@/pages/verify-email'
import { authGetMe } from '@/shared/api'
import {
  forgotPasswordPath,
  acceptAccountInvitationPath,
  adminAccountsPath,
  loginPath,
  registerPath,
  resendEmailVerificationPath,
  resetPasswordPath,
  verifyEmailPath,
} from '@/shared/routes'

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
      { path: adminAccountsPath.slice(1), element: <AdminAccountsPage /> },
      {
        path: `${adminAccountsPath.slice(1)}/:accountId`,
        element: <AdminAccountDetailsPage />,
      },
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
    path: loginPath,
    loader: createRedirectAuthenticatedLoader({ load: loadSession }),
    element: <LoginPage />,
    errorElement: <RouteError />,
  },
  {
    path: registerPath,
    loader: createRedirectAuthenticatedLoader({ load: loadSession }),
    element: <RegisterPage />,
    errorElement: <RouteError />,
  },
  {
    path: resendEmailVerificationPath,
    loader: createRedirectAuthenticatedLoader({ load: loadSession }),
    element: <ResendEmailVerificationPage />,
    errorElement: <RouteError />,
  },
  {
    path: verifyEmailPath,
    element: <VerifyEmailPage />,
    errorElement: <RouteError />,
  },
  {
    path: forgotPasswordPath,
    loader: createRedirectAuthenticatedLoader({ load: loadSession }),
    element: <ForgotPasswordPage />,
    errorElement: <RouteError />,
  },
  {
    path: resetPasswordPath,
    element: <ResetPasswordPage />,
    errorElement: <RouteError />,
  },
  {
    path: acceptAccountInvitationPath,
    element: <AcceptAccountInvitationPage />,
    errorElement: <RouteError />,
  },
])
