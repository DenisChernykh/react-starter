import { useEffect } from 'react'
import {
  useLocation,
  useNavigate,
  useRevalidator,
  useRouteError,
} from 'react-router'

import { clearCurrentSession } from '@/entities/session'
import { isProblemCode } from '@/shared/api'
import { ErrorMessage } from '@/shared/ui'

import { queryClient } from '../config/query-client'
import { getRouteErrorPresentation } from './route-error-presentation'

function AuthenticationRedirect() {
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    clearCurrentSession(queryClient)
    const returnTo = `${location.pathname}${location.search}${location.hash}`
    navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`, {
      replace: true,
    })
  }, [location.hash, location.pathname, location.search, navigate])

  return <p>Перенаправляем на страницу входа…</p>
}

/** Отображает ошибку маршрута или перенаправляет неаутентифицированного пользователя на вход. */
export function RouteError() {
  const error = useRouteError()
  const revalidator = useRevalidator()

  if (isProblemCode(error, 'AUTHENTICATION_REQUIRED')) {
    return <AuthenticationRedirect />
  }

  const presentation = getRouteErrorPresentation(error)
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <section className="max-w-md text-center">
        <ErrorMessage>{presentation.message}</ErrorMessage>
        {presentation.requestId !== undefined &&
          presentation.requestId.length > 0 && (
            <p className="mt-2 text-sm text-zinc-600">
              Код запроса: {presentation.requestId}
            </p>
          )}
        {presentation.retryable && (
          <button
            type="button"
            onClick={() => revalidator.revalidate()}
            className="mt-4 rounded-md border border-zinc-300 px-3 py-2"
          >
            Повторить
          </button>
        )}
      </section>
    </main>
  )
}
